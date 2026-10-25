import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
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
 * - GEMINI_API_KEY: 共通点・相違点・問いの案を作るために使う（未設定なら、そのAPIは503）
 */
const tableName = process.env["TABLE_NAME"];
if (!tableName) throw new Error("環境変数 TABLE_NAME が設定されていません");

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const geminiKey = process.env["GEMINI_API_KEY"];
const allowedOrigin = process.env["ALLOWED_ORIGIN"];

const app = createApp({
  repos: createDynamoRepositories(new DynamoKvStore(client, tableName)),
  adminToken: process.env["ADMIN_TOKEN"],
  ...(allowedOrigin ? { allowedOrigin } : {}),
  ...(geminiKey ? { insightProvider: new GeminiInsightProvider({ apiKey: geminiKey }) } : {}),
});

export async function handler(event: HttpApiEvent): Promise<HttpApiResult> {
  return toHttpApiResult(await app.handleRequest(toHttpRequest(event)));
}
