import { describe, expect, it } from "vitest";
import { GeminiInsightProvider } from "../../core/src/insights/geminiProvider.js";
import { FakeInsightProvider } from "../../core/src/insights/fakeProvider.js";
import { validateCandidates } from "../../core/src/insights/transcriptValidation.js";
import { createTestApp } from "./helpers.js";

async function setup(limits: { transcript?: number } = {}) {
  const insightProvider = new FakeInsightProvider();
  const t = createTestApp({ insightProvider, dailyLimits: limits });
  const a = await t.openSession();
  const extract = (text: unknown, sessionId = a.sessionId) => t.call("POST", `/sessions/${sessionId}/transcript`, { body: { text } });
  return { ...t, ...a, insightProvider, extract };
}

describe("話した内容の文字から、付箋の候補を作るAPI", () => {
  it("参加者(管理者でなくても)が使え、候補を返す。何も保存しない", async () => {
    const { extract, call, sessionId, insightProvider } = await setup();
    const res = await extract("駅から遠いのが大変でした。犬は入れますか？");
    expect(res.statusCode).toBe(200);
    expect(res.json.candidates).toEqual([
      { body: "駅から遠いのが大変でした", kind: "idea" },
      { body: "犬は入れますか？", kind: "question" },
    ]);
    expect(insightProvider.transcriptRequests[0]).toMatchObject({ question: "問い" });
    // 候補は保存されない
    expect((await call("GET", `/sessions/${sessionId}/opinions`)).json.opinions).toHaveLength(0);
  });

  it("基盤が未設定なら503", async () => {
    const t = createTestApp();
    const { sessionId } = await t.openSession();
    const res = await t.call("POST", `/sessions/${sessionId}/transcript`, { body: { text: "あ" } });
    expect(res.statusCode).toBe(503);
  });

  it("文字が空、長すぎる、文字列でないときは400。AIは呼ばない", async () => {
    const { extract, insightProvider } = await setup();
    expect((await extract("")).statusCode).toBe(400);
    expect((await extract("   ")).statusCode).toBe(400);
    expect((await extract(1)).statusCode).toBe(400);
    expect((await extract("あ".repeat(4001))).statusCode).toBe(400);
    expect((await extract("あ".repeat(4000))).statusCode).toBe(200);
    expect(insightProvider.transcriptRequests).toHaveLength(1);
  });

  it("投稿を受け付けていないテーマでは、AIを呼ばない", async () => {
    const t = createTestApp({ insightProvider: new FakeInsightProvider() });
    const event = (await t.call("POST", "/events", { admin: true, body: { name: "E" } })).json;
    await t.call("PATCH", `/events/${event.id}`, { admin: true, body: { status: "active" } });
    const draft = (await t.call("POST", `/events/${event.id}/sessions`, { admin: true, body: { title: "T", prompt: "問い" } })).json;
    const res = await t.call("POST", `/sessions/${draft.id}/transcript`, { body: { text: "あ" } });
    expect(res.statusCode).toBe(400);
    expect(res.json.error.code).toBe("not_accepting");
    expect((await t.call("POST", "/sessions/none/transcript", { body: { text: "あ" } })).statusCode).toBe(404);
  });

  it("1日の上限を超えると429(イベントごと)", async () => {
    const { extract } = await setup({ transcript: 2 });
    expect((await extract("あ")).statusCode).toBe(200);
    expect((await extract("い")).statusCode).toBe(200);
    const res = await extract("う");
    expect(res.statusCode).toBe(429);
    expect(res.json.error.code).toBe("daily_limit");
  });

  it("AIが失敗したときは502、出力が正しくないときも拒否する", async () => {
    const { extract, insightProvider } = await setup();
    insightProvider.failWith = "boom";
    expect((await extract("あ")).statusCode).toBe(502);
    insightProvider.failWith = undefined;
    insightProvider.extractOutput = { opinions: "x" };
    expect((await extract("あ")).statusCode).toBe(502);
  });
});

describe("validateCandidates", () => {
  it("空の候補は取り除き、前後の空白を削る。0件も正しい", () => {
    expect(validateCandidates({ opinions: [{ body: "  a  ", kind: "idea" }, { body: " ", kind: "idea" }] }, 300)).toEqual([{ body: "a", kind: "idea" }]);
    expect(validateCandidates({ opinions: [] }, 300)).toEqual([]);
  });

  it("長い候補は、上限で切る。多い候補は、20件まで", () => {
    expect(validateCandidates({ opinions: [{ body: "あ".repeat(500), kind: "idea" }] }, 300)[0]!.body).toHaveLength(300);
    const many = Array.from({ length: 30 }, (_, i) => ({ body: `意見${i}`, kind: "idea" }));
    expect(validateCandidates({ opinions: many }, 300)).toHaveLength(20);
    expect(() => validateCandidates({ opinions: Array.from({ length: 41 }, () => ({ body: "a", kind: "idea" })) }, 300)).toThrow();
  });

  it("形が違う、種類が違う、制御文字があるものは拒否する", () => {
    expect(() => validateCandidates(null, 300)).toThrow();
    expect(() => validateCandidates({ opinions: [1] }, 300)).toThrow();
    expect(() => validateCandidates({ opinions: [{ body: 1, kind: "idea" }] }, 300)).toThrow();
    expect(() => validateCandidates({ opinions: [{ body: "a", kind: "other" }] }, 300)).toThrow();
    expect(() => validateCandidates({ opinions: [{ body: "a\u0001", kind: "idea" }] }, 300)).toThrow();
  });
});

describe("GeminiInsightProvider.extractOpinions", () => {
  const reply = (text: unknown, ok = true) =>
    (async () => ({ ok, status: ok ? 200 : 500, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) })) as unknown as typeof fetch;

  it("文字を送り、JSONの応答を返す", async () => {
    let sent: { body?: string } = {};
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      sent = init;
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"opinions":[]}' }] } }] }) };
    }) as unknown as typeof fetch;
    const provider = new GeminiInsightProvider({ apiKey: "k", fetch: fetchImpl });
    expect(await provider.extractOpinions({ question: "問い", text: "話した内容" })).toEqual({ opinions: [] });
    expect(JSON.parse(sent.body!).contents[0].parts[0].text).toContain("話した内容");
  });

  it("エラー、本文なし、JSONでない応答は、失敗にする", async () => {
    const p = (f: typeof fetch) => new GeminiInsightProvider({ apiKey: "k", fetch: f });
    await expect(p(reply("{}", false)).extractOpinions({ question: "q", text: "t" })).rejects.toThrow();
    await expect(p(reply(undefined)).extractOpinions({ question: "q", text: "t" })).rejects.toThrow();
    await expect(p(reply("not json")).extractOpinions({ question: "q", text: "t" })).rejects.toThrow();
  });
});
