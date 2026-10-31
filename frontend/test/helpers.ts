import { vi } from "vitest";
import type { OpinionKind, PublicOpinion } from "../src/api/types.ts";

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export const SESSION = {
  id: "s1",
  title: "セッションのタイトル",
  prompt: "いま感じていることを教えてください",
  format: "workshop",
  status: "active",
  eventName: "テストイベント",
  acceptingOpinions: true,
  showOpinions: true,
};

export const opinion = (
  id: string,
  body: string,
  kind: OpinionKind = "idea",
  createdAt = "2026-01-01T00:00:00.000Z",
): PublicOpinion => ({ id, body, kind, createdAt });

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** URLの末尾ごとに応答を返す fetch のスタブ。呼び出しの記録も取る */
export function stubFetch(handler: Handler) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init));
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** POST の呼び出し。画面が見ていることを知らせる通信(presence)は、数えない */
export const postCalls = (mock: ReturnType<typeof stubFetch>) =>
  mock.mock.calls.filter(
    ([url, init]) => (init as RequestInit | undefined)?.method === "POST" && !String(url).endsWith("/presence"),
  );
