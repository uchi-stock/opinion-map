import { DescribeTasksCommand, RunTaskCommand, type ECSClient } from "@aws-sdk/client-ecs";
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { RunnerPort } from "../../../core/src/adapters/kouchouFargate.js";

/** 使う操作だけに絞る。テストでは send を差し替える */
type Sender = { send: (command: never) => Promise<unknown> };

export interface AwsRunnerConfig {
  s3: Pick<S3Client, "send"> | Sender;
  ecs: Pick<ECSClient, "send"> | Sender;
  bucket: string;
  cluster: string;
  taskDefinition: string;
  containerName: string;
  subnets: string[];
  securityGroups: string[];
}

const hasName = (error: unknown, names: string[]) =>
  typeof error === "object" && error !== null && names.includes((error as { name?: string }).name ?? "");

/**
 * S3 と ECS(Fargate)を使う RunnerPort。
 * タスクには公開IPを付ける(NATなしで、イメージの取得とLLMの呼び出しをするため)。
 * 入口は、セキュリティグループで閉じる。
 */
export function createAwsRunnerPort(config: AwsRunnerConfig): RunnerPort {
  const s3 = config.s3 as { send: (c: unknown) => Promise<any> };
  const ecs = config.ecs as { send: (c: unknown) => Promise<any> };

  return {
    async putObject(key, body) {
      await s3.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: "application/json" }));
    },

    async getObject(key) {
      try {
        const result = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        return (await result.Body?.transformToString("utf-8")) as string | undefined;
      } catch (error) {
        if (hasName(error, ["NoSuchKey", "NotFound"])) return undefined;
        throw error;
      }
    },

    async deleteObjects(keys) {
      if (keys.length === 0) return;
      await s3.send(
        new DeleteObjectsCommand({ Bucket: config.bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }),
      );
    },

    async runTask(env) {
      const result = await ecs.send(
        new RunTaskCommand({
          cluster: config.cluster,
          taskDefinition: config.taskDefinition,
          launchType: "FARGATE",
          count: 1,
          networkConfiguration: {
            awsvpcConfiguration: { subnets: config.subnets, securityGroups: config.securityGroups, assignPublicIp: "ENABLED" },
          },
          overrides: {
            containerOverrides: [
              { name: config.containerName, environment: Object.entries(env).map(([name, value]) => ({ name, value })) },
            ],
          },
        }),
      );
      const arn = result.tasks?.[0]?.taskArn as string | undefined;
      if (!arn) {
        const reason = result.failures?.[0]?.reason as string | undefined;
        throw new Error(`分析のタスクを起動できませんでした${reason ? `: ${reason}` : ""}`);
      }
      return arn;
    },

    async describeTask(taskArn) {
      const result = await ecs.send(new DescribeTasksCommand({ cluster: config.cluster, tasks: [taskArn] }));
      const task = result.tasks?.[0];
      // 古いタスクは、しばらくすると一覧から消える。見つからないものは、止まったものとして扱う
      if (!task) return { lastStatus: "STOPPED", stopCode: "TaskNotFound", stoppedReason: result.failures?.[0]?.reason };
      const exitCode = task.containers?.[0]?.exitCode as number | undefined;
      return {
        lastStatus: (task.lastStatus ?? "UNKNOWN") as string,
        ...(task.stopCode ? { stopCode: task.stopCode as string } : {}),
        ...(task.stoppedReason ? { stoppedReason: task.stoppedReason as string } : {}),
        ...(exitCode !== undefined ? { exitCode } : {}),
      };
    },
  };
}
