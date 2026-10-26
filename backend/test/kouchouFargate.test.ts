import { DescribeTasksCommand, RunTaskCommand } from "@aws-sdk/client-ecs";
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { createAwsRunnerPort } from "../src/adapters/awsRunnerPort.js";
import { csvField, KouchouFargateProvider, toCsv, type RunnerPort } from "../src/adapters/kouchouFargate.js";

/** メモリ上の S3 と、操作できるタスクの状態 */
function fakePort() {
  const objects = new Map<string, string>();
  const state = {
    task: { lastStatus: "RUNNING" } as { lastStatus: string; stopCode?: string; stoppedReason?: string; exitCode?: number },
    runTaskError: undefined as string | undefined,
    ran: [] as Array<Record<string, string>>,
  };
  const port: RunnerPort = {
    async putObject(key, body) {
      objects.set(key, body);
    },
    async getObject(key) {
      return objects.get(key);
    },
    async deleteObjects(keys) {
      for (const k of keys) objects.delete(k);
    },
    async runTask(env) {
      if (state.runTaskError) throw new Error(state.runTaskError);
      state.ran.push(env);
      return "arn:aws:ecs:ap-northeast-1:123:task/c/abc";
    },
    async describeTask() {
      return state.task;
    },
  };
  return { port, objects, state };
}

const request = {
  runId: "run-1",
  sessionId: "s1",
  question: "問い",
  opinions: [
    { id: "o1", kind: "idea" as const, body: "普通の意見" },
    { id: "o2", kind: "idea" as const, body: 'カンマ, 引用符" と\n改行を含む' },
  ],
};

const kouchouResult = {
  overview: "概要",
  clusters: [
    { id: "0", level: 0, label: "全体" },
    { id: "1_1", level: 1, label: "A", takeaway: "a", parent: "0" },
  ],
  arguments: [{ comment_id: "o1", cluster_ids: ["0", "1_1"] }],
};

describe("CSVの作成", () => {
  it("カンマ・引用符・改行を含む欄は、引用符で囲む", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("l1\nl2")).toBe('"l1\nl2"');
  });

  it("見出しと、1投稿1行を作る", () => {
    expect(toCsv(request.opinions)).toBe('comment-id,comment-body\no1,普通の意見\no2,"カンマ, 引用符"" と\n改行を含む"\n');
  });
});

describe("KouchouFargateProvider", () => {
  it("入力と設定をS3に置き、タスクを起動する", async () => {
    const { port, objects, state } = fakePort();
    const { providerRunId } = await new KouchouFargateProvider({ port }).start(request);
    expect(providerRunId).toBe("analysis/run-1|arn:aws:ecs:ap-northeast-1:123:task/c/abc");
    expect(objects.get("analysis/run-1/input.csv")).toContain("comment-id,comment-body");
    const config = JSON.parse(objects.get("analysis/run-1/config.json")!);
    expect(config).toMatchObject({
      question: "問い",
      input: "input",
      provider: "gemini",
      model: "gemini-2.5-flash",
      extraction: { limit: 2 },
      hierarchical_clustering: { cluster_nums: [2] },
    });
    expect(state.ran).toEqual([{ ANALYSIS_PREFIX: "analysis/run-1" }]);
  });

  it("タスクを起動できなければ、投げる(サービス側で失敗として記録される)", async () => {
    const { port, state } = fakePort();
    state.runTaskError = "RESOURCE:FARGATE";
    await expect(new KouchouFargateProvider({ port }).start(request)).rejects.toThrow("RESOURCE:FARGATE");
  });

  it("結果がなく、タスクが動いていれば running", async () => {
    const { port } = fakePort();
    const p = new KouchouFargateProvider({ port });
    const { providerRunId } = await p.start(request);
    expect(await p.poll(providerRunId)).toEqual({ status: "running" });
  });

  it("結果が置かれれば succeeded。取り込むと、S3の本文は消える", async () => {
    const { port, objects } = fakePort();
    const p = new KouchouFargateProvider({ port });
    const { providerRunId } = await p.start(request);
    objects.set("analysis/run-1/result.json", JSON.stringify(kouchouResult));
    expect(await p.poll(providerRunId)).toEqual({ status: "succeeded" });
    const result = await p.fetchResult(providerRunId, request.opinions);
    expect(result.clusters.map((c) => [c.id, c.opinionIds])).toEqual([["1_1", ["o1"]]]);
    expect([...objects.keys()]).toEqual([]);
  });

  it("エラーが置かれれば failed。理由を短くして返す", async () => {
    const { port, objects } = fakePort();
    const p = new KouchouFargateProvider({ port });
    const { providerRunId } = await p.start(request);
    objects.set("analysis/run-1/error.json", JSON.stringify({ summary: "x".repeat(500) }));
    const state = await p.poll(providerRunId);
    expect(state).toMatchObject({ status: "failed", errorCode: "runner_failed" });
    expect((state as { errorSummary: string }).errorSummary).toHaveLength(300);
  });

  it("エラーの中身が読めなくても、failed にする", async () => {
    const { port, objects } = fakePort();
    const p = new KouchouFargateProvider({ port });
    const { providerRunId } = await p.start(request);
    objects.set("analysis/run-1/error.json", "壊れている");
    expect(await p.poll(providerRunId)).toMatchObject({ status: "failed" });
  });

  it("結果もエラーもなくタスクが止まれば、止まった理由つきで failed", async () => {
    const { port, state } = fakePort();
    const p = new KouchouFargateProvider({ port });
    const { providerRunId } = await p.start(request);
    state.task = { lastStatus: "STOPPED", stopCode: "TaskFailedToStart", stoppedReason: "CannotPullContainerError", exitCode: 137 };
    const result = await p.poll(providerRunId);
    expect(result).toMatchObject({ status: "failed", errorCode: "task_stopped" });
    expect((result as { errorSummary: string }).errorSummary).toContain("CannotPullContainerError");
    expect((result as { errorSummary: string }).errorSummary).toContain("exit 137");
  });

  it("結果の取り込みで、削除に失敗しても、結果は返す", async () => {
    const { port, objects } = fakePort();
    port.deleteObjects = async () => {
      throw new Error("denied");
    };
    const p = new KouchouFargateProvider({ port });
    const { providerRunId } = await p.start(request);
    objects.set("analysis/run-1/result.json", JSON.stringify(kouchouResult));
    expect((await p.fetchResult(providerRunId, request.opinions)).clusters).toHaveLength(1);
  });

  it("結果がないのに取り込もうとすれば、投げる", async () => {
    const { port } = fakePort();
    const p = new KouchouFargateProvider({ port });
    await expect(p.fetchResult("analysis/run-1|arn", [])).rejects.toThrow();
  });
});

describe("AWSのRunnerPort", () => {
  const config = {
    bucket: "b",
    cluster: "c",
    taskDefinition: "td",
    containerName: "runner",
    subnets: ["subnet-1", "subnet-2"],
    securityGroups: ["sg-1"],
  };
  const make = (handler: (command: any) => unknown) => {
    const sent: any[] = [];
    const sender = {
      send: async (command: any) => {
        sent.push(command);
        return handler(command);
      },
    };
    return { port: createAwsRunnerPort({ ...config, s3: sender, ecs: sender }), sent };
  };
  const named = (name: string) => Object.assign(new Error(name), { name });

  it("S3へ置く・読む・消す。存在しないキーは undefined", async () => {
    const { port, sent } = make((c) => {
      if (c instanceof GetObjectCommand) {
        if (c.input.Key === "missing") throw named("NoSuchKey");
        return { Body: { transformToString: async () => "中身" } };
      }
      return {};
    });
    await port.putObject("k", "v");
    expect(sent[0]).toBeInstanceOf(PutObjectCommand);
    expect(sent[0].input).toMatchObject({ Bucket: "b", Key: "k", Body: "v" });
    expect(await port.getObject("k")).toBe("中身");
    expect(await port.getObject("missing")).toBeUndefined();
    await port.deleteObjects(["a", "b"]);
    const del = sent.find((c) => c instanceof DeleteObjectsCommand) as DeleteObjectsCommand | undefined;
    expect(del?.input.Delete?.Objects).toEqual([{ Key: "a" }, { Key: "b" }]);
  });

  it("S3のその他のエラーは、そのまま投げる", async () => {
    const { port } = make(() => {
      throw named("AccessDenied");
    });
    await expect(port.getObject("k")).rejects.toThrow("AccessDenied");
  });

  it("タスクを、公開IPつき・入口なしの設定で起動し、環境変数を渡す", async () => {
    const { port, sent } = make(() => ({ tasks: [{ taskArn: "arn:task" }] }));
    expect(await port.runTask({ ANALYSIS_PREFIX: "analysis/r" })).toBe("arn:task");
    expect(sent[0]).toBeInstanceOf(RunTaskCommand);
    expect(sent[0].input).toMatchObject({
      cluster: "c",
      taskDefinition: "td",
      launchType: "FARGATE",
      count: 1,
      networkConfiguration: {
        awsvpcConfiguration: { subnets: ["subnet-1", "subnet-2"], securityGroups: ["sg-1"], assignPublicIp: "ENABLED" },
      },
      overrides: { containerOverrides: [{ name: "runner", environment: [{ name: "ANALYSIS_PREFIX", value: "analysis/r" }] }] },
    });
  });

  it("起動できなかったときは、理由つきで投げる", async () => {
    const { port } = make(() => ({ tasks: [], failures: [{ reason: "RESOURCE:FARGATE" }] }));
    await expect(port.runTask({})).rejects.toThrow("RESOURCE:FARGATE");
  });

  it("タスクの状態を返す。見つからないタスクは、止まったものとして扱う", async () => {
    const running = make(() => ({ tasks: [{ lastStatus: "RUNNING" }] }));
    expect(await running.port.describeTask("arn")).toEqual({ lastStatus: "RUNNING" });
    expect(running.sent[0]).toBeInstanceOf(DescribeTasksCommand);
    const stopped = make(() => ({
      tasks: [{ lastStatus: "STOPPED", stopCode: "EssentialContainerExited", stoppedReason: "OOM", containers: [{ exitCode: 137 }] }],
    }));
    expect(await stopped.port.describeTask("arn")).toEqual({
      lastStatus: "STOPPED",
      stopCode: "EssentialContainerExited",
      stoppedReason: "OOM",
      exitCode: 137,
    });
    const gone = make(() => ({ tasks: [], failures: [{ reason: "MISSING" }] }));
    expect(await gone.port.describeTask("arn")).toMatchObject({ lastStatus: "STOPPED", stopCode: "TaskNotFound" });
  });
});
