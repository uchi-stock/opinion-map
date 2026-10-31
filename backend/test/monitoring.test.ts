import { describe, expect, it } from "vitest";
import { FakeAnalysisProvider } from "../src/analysis/fakeProvider.js";
import { createTestApp, createTestRepositories, newSubmissionId } from "./helpers.js";

type LogEntry = { event: string; fields: Record<string, unknown> };
const collect = () => {
  const entries: LogEntry[] = [];
  return { entries, log: (event: string, fields: Record<string, unknown> = {}) => entries.push({ event, fields }) };
};

describe("画面のエラーの報告", () => {
  it("認証なしで受け取り、ログに残す。パスだけにして、クエリとハッシュを落とす。制御文字は除く", async () => {
    const { entries, log } = collect();
    const t = createTestApp({ log });
    const res = await t.call("POST", "/client-errors", { body: { message: "Cannot read\u0000 properties\nof undefined", path: "/e/abc?token=secret#frag" } });
    expect(res.statusCode).toBe(202);
    expect(entries).toEqual([{ event: "client_error", fields: { message: "Cannot read  properties of undefined", path: "/e/abc" } }]);
    expect(JSON.stringify(entries)).not.toContain("secret");
  });

  it("長いメッセージは切る。パスでないものは捨てる。メッセージが空なら400", async () => {
    const { entries, log } = collect();
    const t = createTestApp({ log });
    await t.call("POST", "/client-errors", { body: { message: "あ".repeat(500), path: "https://evil.example/x" } });
    expect(Array.from(String(entries[0]!.fields["message"])).length).toBe(200);
    expect(entries[0]!.fields["path"]).toBe("");
    expect((await t.call("POST", "/client-errors", { body: { message: "   " } })).statusCode).toBe(400);
    expect((await t.call("POST", "/client-errors", { body: {} })).statusCode).toBe(400);
    expect(entries).toHaveLength(1);
  });

  it("1日の上限を超えると、429で、ログに残さない(ログが溢れない)", async () => {
    const { entries, log } = collect();
    const t = createTestApp({ log, dailyLimits: { clientError: 2 } });
    const send = () => t.call("POST", "/client-errors", { body: { message: "エラー" } });
    expect((await send()).statusCode).toBe(202);
    expect((await send()).statusCode).toBe(202);
    expect((await send()).statusCode).toBe(429);
    expect(entries).toHaveLength(2);
  });
});

describe("障害の検知のログ", () => {
  it("分析が失敗したら、コードだけをログに残す。投稿の本文は含めない", async () => {
    const { entries, log } = collect();
    const provider = new FakeAnalysisProvider();
    provider.nextState = { status: "failed", errorCode: "llm_quota", errorSummary: "意見Aの本文を含む説明" };
    const t = createTestApp({ log, analysisProvider: provider });
    const a = await t.openSession();
    await t.call("POST", `/sessions/${a.sessionId}/opinions`, { body: { submissionId: newSubmissionId(), kind: "idea", body: "意見A" } });
    const run = (await t.call("POST", `/sessions/${a.sessionId}/analyses`, { admin: true })).json;
    await t.call("GET", `/analyses/${run.id}`, { admin: true });
    expect(entries).toEqual([{ event: "analysis_failed", fields: { code: "llm_quota" } }]);
    expect(JSON.stringify(entries)).not.toContain("意見A");
  });

  it("開始に失敗したときも、検知できる", async () => {
    const { entries, log } = collect();
    const provider = new FakeAnalysisProvider();
    provider.failOnStart = "接続できない";
    const t = createTestApp({ log, analysisProvider: provider });
    const a = await t.openSession();
    await t.call("POST", `/sessions/${a.sessionId}/opinions`, { body: { submissionId: newSubmissionId(), kind: "idea", body: "意見" } });
    await t.call("POST", `/sessions/${a.sessionId}/analyses`, { admin: true });
    expect(entries).toEqual([{ event: "analysis_failed", fields: { code: "provider_start_failed" } }]);
  });

  it("予期しないエラーは500で、種類の名前だけをログに残す(メッセージは出さない)", async () => {
    const { entries, log } = collect();
    const repos = createTestRepositories();
    repos.events.list = async () => {
      throw new TypeError("秘密の本文を含むメッセージ");
    };
    const t = createTestApp({ log, repos });
    const res = await t.call("GET", "/events", { admin: true });
    expect(res.statusCode).toBe(500);
    expect(entries).toEqual([{ event: "server_error", fields: { name: "TypeError" } }]);
    expect(JSON.stringify(entries)).not.toContain("秘密");
  });

  it("上限に達して断った分析は、障害としては数えない", async () => {
    const { entries, log } = collect();
    const t = createTestApp({ log, analysisProvider: new FakeAnalysisProvider(), dailyLimits: { analysis: 0 } });
    const a = await t.openSession();
    await t.call("POST", `/sessions/${a.sessionId}/opinions`, { body: { submissionId: newSubmissionId(), kind: "idea", body: "意見" } });
    expect((await t.call("POST", `/sessions/${a.sessionId}/analyses`, { admin: true })).statusCode).toBe(429);
    expect(entries).toHaveLength(0);
  });
});
