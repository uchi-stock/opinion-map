import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { ECSClient } from "@aws-sdk/client-ecs";
import { S3Client } from "@aws-sdk/client-s3";
import { createAwsRunnerPort } from "./adapters/awsRunnerPort.js";
import { KouchouFargateProvider } from "./adapters/kouchouFargate.js";
import { createApp } from "./app.js";
import { GeminiInsightProvider } from "./insights/geminiProvider.js";
import { toHttpApiResult, toHttpRequest, type HttpApiEvent, type HttpApiResult } from "./lambdaAdapter.js";
import { DynamoKvStore } from "./repositories/dynamoKvStore.js";
import { createDynamoRepositories } from "./repositories/dynamoRepositories.js";

/**
 * Lambda のエントリポイント。AWS SDK への依存は、ここと repositories/dynamo* に閉じ込める。
 * 環境変数:
 * - TABLE_NAME: DynamoDB のテーブル名（必須）
 * - ADMIN_TOKEN: オーナーのトークン（未設定なら、運営者のAPIはすべて拒否される）
 * - ALLOWED_ORIGIN: CORS で許可するオリジン（API Gateway 側で設定する場合は不要）
 * - API_PREFIX: パスの先頭から取り除く部分(CloudFront が /api/* を転送する構成で、"/api")
 * - GOOGLE_CLIENT_ID、SESSION_SECRET: Googleアカウントでのオーナーのログイン。両方あるときだけ有効になる
 * - OWNER_EMAILS: 管理者の初期登録(カンマ区切り)。管理者の一覧が空のときだけ使う。
 *   以降の管理者の追加・削除は、管理画面から行う
 * - ANALYSIS_BUCKET、ANALYSIS_CLUSTER、ANALYSIS_TASK_DEFINITION、ANALYSIS_CONTAINER、
 *   ANALYSIS_SUBNETS、ANALYSIS_SECURITY_GROUPS(後ろ2つはカンマ区切り): 広聴AIをFargateで動かす設定。
 *   すべて揃っているときだけ、分析のAPIが使える(なければ503)
 * - ANALYSIS_DAILY_LIMIT、INSIGHT_DAILY_LIMIT: AIの利用の、イベントごと・1日あたりの上限(分析は既定10、案の生成は既定100。0以上の整数)
 * - GEMINI_API_KEY: 共通点・相違点・問いの案を作るために使う（未設定なら、そのAPIは503）
 */
const tableName = process.env["TABLE_NAME"];
if (!tableName) throw new Error("環境変数 TABLE_NAME が設定されていません");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const geminiKey = process.env["GEMINI_API_KEY"];
const allowedOrigin = process.env["ALLOWED_ORIGIN"];
const apiPrefix = process.env["API_PREFIX"];
const googleClientId = process.env["GOOGLE_CLIENT_ID"];
const sessionSecret = process.env["SESSION_SECRET"];
const list = (name: string) =>
  (process.env[name] ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "");
const analysisBucket = process.env["ANALYSIS_BUCKET"];
const analysisCluster = process.env["ANALYSIS_CLUSTER"];
const analysisTaskDefinition = process.env["ANALYSIS_TASK_DEFINITION"];
const analysisContainer = process.env["ANALYSIS_CONTAINER"];
const analysisSubnets = list("ANALYSIS_SUBNETS");
const analysisSecurityGroups = list("ANALYSIS_SECURITY_GROUPS");
const analysisProvider =
  analysisBucket && analysisCluster && analysisTaskDefinition && analysisContainer && analysisSubnets.length > 0 && analysisSecurityGroups.length > 0
    ? new KouchouFargateProvider({
        port: createAwsRunnerPort({
          s3: new S3Client({}),
          ecs: new ECSClient({}),
          bucket: analysisBucket,
          cluster: analysisCluster,
          taskDefinition: analysisTaskDefinition,
          containerName: analysisContainer,
          subnets: analysisSubnets,
          securityGroups: analysisSecurityGroups,
        }),
      })
    : undefined;
const ownerEmails = (process.env["OWNER_EMAILS"] ?? "").split(",");

/** 環境変数の上限。0以上の整数だけを受け付け、不正な値は既定に戻す */
const limitFromEnv = (name: string): number | undefined => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
};
const analysisDailyLimit = limitFromEnv("ANALYSIS_DAILY_LIMIT");
const insightDailyLimit = limitFromEnv("INSIGHT_DAILY_LIMIT");

const app = createApp({
  repos: createDynamoRepositories(new DynamoKvStore(client, tableName)),
  adminToken: process.env["ADMIN_TOKEN"],
  ...(allowedOrigin ? { allowedOrigin } : {}),
  dailyLimits: {
    ...(analysisDailyLimit === undefined ? {} : { analysis: analysisDailyLimit }),
    ...(insightDailyLimit === undefined ? {} : { insight: insightDailyLimit }),
  },
  ...(googleClientId && sessionSecret
    ? { ownerLogin: { googleClientId, sessionSecret, ownerEmails } }
    : {}),
  ...(analysisProvider ? { analysisProvider } : {}),
  ...(geminiKey ? { insightProvider: new GeminiInsightProvider({ apiKey: geminiKey }) } : {}),
});

export async function handler(event: HttpApiEvent): Promise<HttpApiResult> {
  return toHttpApiResult(await app.handleRequest(toHttpRequest(event, apiPrefix ? { stripPrefix: apiPrefix } : {})));
}
