import { createApp, type AppOptions, type HttpResponse } from "../src/app.js";
import { createDynamoRepositories } from "../src/repositories/dynamoRepositories.js";
import { createInMemoryRepositories } from "../src/repositories/inMemory.js";
import { MemoryKvStore } from "../src/repositories/kvStore.js";

export const ADMIN_TOKEN = "test-admin-token";

/** TEST_REPOS=dynamo のとき、同じテストを DynamoDB 実装（メモリ上の保存先）で実行する */
export function createTestRepositories() {
  return process.env["TEST_REPOS"] === "dynamo"
    ? createDynamoRepositories(new MemoryKvStore())
    : createInMemoryRepositories();
}

export function createTestApp(overrides: Partial<AppOptions> = {}) {
  let counter = 0;
  let minute = 0;
  const app = createApp({
    repos: createTestRepositories(),
    adminToken: ADMIN_TOKEN,
    // 時刻とIDを固定して、順序を安定させる
    now: () => new Date(Date.UTC(2026, 0, 1, 0, minute++, 0)),
    newId: () => `id-${++counter}`,
    ...overrides,
  });

  async function call(
    method: string,
    path: string,
    options: { body?: unknown; rawBody?: string; admin?: boolean; headers?: Record<string, string> } = {},
  ): Promise<HttpResponse & { json: any }> {
    const headers: Record<string, string | undefined> = { ...options.headers };
    if (options.admin) headers["authorization"] = `Bearer ${ADMIN_TOKEN}`;
    const raw = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
    const response = await app.handleRequest({ method, path, headers, ...(raw === undefined ? {} : { body: raw }) });
    return { ...response, json: response.body ? JSON.parse(response.body) : undefined };
  }

  /** 公開済み（イベント・セッションとも active）のセッションを作る */
  async function openSession(sessionBody: Record<string, unknown> = {}) {
    const event = (await call("POST", "/events", { admin: true, body: { name: "テストイベント" } })).json;
    await call("PATCH", `/events/${event.id}`, { admin: true, body: { status: "active" } });
    const session = (
      await call("POST", `/events/${event.id}/sessions`, {
        admin: true,
        body: { title: "セッション", prompt: "問い", ...sessionBody },
      })
    ).json;
    await call("PATCH", `/sessions/${session.id}`, { admin: true, body: { status: "active" } });
    return { eventId: event.id as string, sessionId: session.id as string };
  }

  return { app, call, openSession };
}

let submission = 0;
/** 投稿用の、形式を満たす送信ID */
export const newSubmissionId = () => `submission-${String(++submission).padStart(8, "0")}`;
