import { FakeAnalysisProvider } from "../../../backend/src/analysis/fakeProvider.ts";
import { FakeInsightProvider } from "../../../backend/src/insights/fakeProvider.ts";
import { createApp, type App } from "../../../backend/src/app.ts";
import type { Repositories } from "../../../backend/src/repositories/types.ts";
import { apiBaseUrl } from "../api/client.ts";
import { createStorageRepositories } from "./storageRepositories.ts";

/** デモ版の運営者のトークン。画面には、はじめから入力してある */
export const DEMO_ADMIN_TOKEN = "demo";

const SAMPLE_OPINIONS = [
  { body: "匿名で書けると、普段は言いにくいことも書けて安心できる", kind: "experience" },
  { body: "少数の意見も、埋もれずに見えるようにしてほしい", kind: "idea" },
  { body: "AIがまとめた結果は、元の投稿を必ず確認できるようにしてほしい", kind: "question" },
] as const;

async function admin(app: App, method: string, path: string, body?: unknown) {
  const response = await app.handleRequest({
    method,
    path,
    headers: { authorization: `Bearer ${DEMO_ADMIN_TOKEN}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return JSON.parse(response.body || "null");
}

/** データが空のときだけ、すぐ試せるイベントとセッション、サンプルの意見を作る */
async function seedIfEmpty(app: App, repos: Repositories): Promise<void> {
  if ((await repos.events.list()).length > 0) return;
  const event = await admin(app, "POST", "/events", {
    name: "デモ用イベント",
    description: "操作を試すための、サンプルのイベントです。",
  });
  await admin(app, "PATCH", `/events/${event.id}`, { status: "active" });
  const session = await admin(app, "POST", `/events/${event.id}/sessions`, {
    title: "デモ用セッション",
    prompt: "このアプリについて、感じたことを教えてください",
  });
  await admin(app, "PATCH", `/sessions/${session.id}`, { status: "active" });
  for (const [i, sample] of SAMPLE_OPINIONS.entries()) {
    await app.handleRequest({
      method: "POST",
      path: `/sessions/${session.id}/opinions`,
      headers: {},
      body: JSON.stringify({ ...sample, submissionId: `demo-sample-${String(i + 1).padStart(8, "0")}` }),
    });
  }
}

/** 公開されているセッションのうち、最初のものを返す（デモ版の案内のリンクに使う） */
export async function findSampleSessionId(repos: Repositories): Promise<string | undefined> {
  for (const event of await repos.events.list()) {
    const sessions = await repos.sessions.listByEvent(event.id);
    const open = sessions.find((s) => s.status === "active");
    if (open && event.status === "active") return open.id;
  }
  return undefined;
}

export interface DemoOptions {
  storage?: Storage;
  /** fetch を差し替える対象。テストで使う */
  target?: { fetch: typeof fetch };
  apiBase?: string;
}

/**
 * デモ版を有効にする。サーバーへ送る代わりに、ブラウザの中でバックエンドのコードを動かす。
 * 通信はせず、データは localStorage に保存する。
 */
export async function installDemoApi(options: DemoOptions = {}) {
  const storage = options.storage ?? window.localStorage;
  const target = options.target ?? globalThis;
  const apiBase = options.apiBase ?? apiBaseUrl();
  const repos = createStorageRepositories(storage);
  const app = createApp({
    repos,
    adminToken: DEMO_ADMIN_TOKEN,
    // 本物の分析ではない。取りこぼしの表示を確かめられるよう、最後の投稿を結果から外す
    insightProvider: new FakeInsightProvider(),
    analysisProvider: new FakeAnalysisProvider((_o, i, total) => total > 2 && i === total - 1),
  });
  await seedIfEmpty(app, repos);

  const originalFetch = target.fetch.bind(target);
  target.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(`${apiBase}/`)) return originalFetch(input, init);

    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const path = url.slice(apiBase.length);
    const body = typeof init?.body === "string" ? init.body : undefined;
    const response = await app.handleRequest({
      method: init?.method ?? "GET",
      path,
      headers,
      ...(body === undefined ? {} : { body }),
    });
    return new Response(response.statusCode === 204 ? null : response.body, {
      status: response.statusCode,
      headers: response.headers,
    });
  };

  return { repos, sampleSessionId: await findSampleSessionId(repos) };
}
