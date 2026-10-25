import { describe, expect, it } from "vitest";
import { FakeAnalysisProvider } from "../src/analysis/fakeProvider.js";
import { validateResult } from "../src/analysis/validation.js";
import { KouchouAiProvider, clusterCounts, parseKouchouResult } from "../src/adapters/kouchouAi.js";
import { createTestApp, newSubmissionId } from "./helpers.js";

async function setup(opinionCount = 3) {
  const provider = new FakeAnalysisProvider();
  const t = createTestApp({ analysisProvider: provider });
  const { sessionId } = await t.openSession();
  for (let i = 0; i < opinionCount; i++) {
    await t.call("POST", `/sessions/${sessionId}/opinions`, {
      body: { submissionId: newSubmissionId(), kind: "idea", body: `意見${i}` },
    });
  }
  return { ...t, provider, sessionId };
}

describe("分析API", () => {
  it("管理者でなければ使えない", async () => {
    const { call, sessionId } = await setup();
    expect((await call("POST", `/sessions/${sessionId}/analyses`)).statusCode).toBe(401);
  });

  it("基盤が未設定なら503", async () => {
    const t = createTestApp();
    const { sessionId } = await t.openSession();
    const res = await t.call("POST", `/sessions/${sessionId}/analyses`, { admin: true });
    expect(res.statusCode).toBe(503);
    expect(res.json.error.code).toBe("analysis_unavailable");
  });

  it("開始から成功まで進み、結果を取得できる", async () => {
    const { call, sessionId } = await setup();
    const started = await call("POST", `/sessions/${sessionId}/analyses`, { admin: true });
    expect(started.statusCode).toBe(202);
    const done = await call("GET", `/analyses/${started.json.id}`, { admin: true });
    expect(done.json.status).toBe("succeeded");
    expect(done.json.result.clusters.length).toBeGreaterThan(0);
  });

  it("実行中は重複して開始できない", async () => {
    const { call, provider, sessionId } = await setup();
    provider.nextState = { status: "running" };
    await call("POST", `/sessions/${sessionId}/analyses`, { admin: true });
    const second = await call("POST", `/sessions/${sessionId}/analyses`, { admin: true });
    expect(second.statusCode).toBe(409);
  });

  it("投稿がなければ開始できない", async () => {
    const { call, sessionId } = await setup(0);
    const res = await call("POST", `/sessions/${sessionId}/analyses`, { admin: true });
    expect(res.statusCode).toBe(400);
    expect(res.json.error.code).toBe("no_opinions");
  });

  it("失敗した分析は再実行でき、成功したものはできない", async () => {
    const { call, provider, sessionId } = await setup();
    provider.nextState = { status: "failed", errorCode: "x", errorSummary: "失敗" };
    const first = (await call("POST", `/sessions/${sessionId}/analyses`, { admin: true })).json;
    expect((await call("GET", `/analyses/${first.id}`, { admin: true })).json.status).toBe("failed");
    provider.nextState = { status: "succeeded" };
    const retry = await call("POST", `/analyses/${first.id}/retry`, { admin: true });
    expect(retry.statusCode).toBe(202);
    const done = await call("GET", `/analyses/${retry.json.id}`, { admin: true });
    expect(done.json.status).toBe("succeeded");
    expect((await call("POST", `/analyses/${retry.json.id}/retry`, { admin: true })).statusCode).toBe(409);
  });

  it("基盤の開始失敗は、失敗した実行として残る", async () => {
    const { call, provider, sessionId } = await setup();
    provider.failOnStart = "接続できない";
    const res = await call("POST", `/sessions/${sessionId}/analyses`, { admin: true });
    const run = (await call("GET", `/analyses/${res.json.id}`, { admin: true })).json;
    expect(run.status).toBe("failed");
  });

  it("不正な結果は失敗にする", async () => {
    const { call, provider, sessionId } = await setup();
    provider.resultOverride = () => ({ overview: "", clusters: [{ id: "c", level: 1, parentId: null, title: "t", summary: "", opinionIds: ["存在しない"] }] });
    const res = await call("POST", `/sessions/${sessionId}/analyses`, { admin: true });
    const run = (await call("GET", `/analyses/${res.json.id}`, { admin: true })).json;
    expect(run.status).toBe("failed");
    expect(run.error.code).toBe("invalid_output");
  });
});

describe("validateResult", () => {
  it("どのクラスタにも入らない投稿を未分類として返す", () => {
    const r = validateResult(
      { overview: "", clusters: [{ id: "a", level: 1, parentId: null, title: "t", summary: "", opinionIds: ["1"] }] },
      ["1", "2"],
    );
    expect(r.unclassifiedOpinionIds).toEqual(["2"]);
  });
});

describe("広聴AIアダプター", () => {
  it("clusterCounts は意見数に応じる", () => {
    expect(clusterCounts(3)).toEqual([2]);
    expect(clusterCounts(27)).toEqual([3, 9]);
    expect(clusterCounts(100000)[0]).toBe(10);
  });

  it("結果を変換する（全体階層は除き、投稿IDを復元する）", () => {
    const r = parseKouchouResult({
      overview: "概要",
      clusters: [
        { id: "0", level: 0, label: "全体" },
        { id: "1_1", level: 1, label: "A", takeaway: "a", parent: "0" },
        { id: "2_1", level: 2, label: "B", takeaway: "b", parent: "1_1" },
      ],
      arguments: [
        { comment_id: "o1", cluster_ids: ["0", "1_1", "2_1"] },
        { comment_id: "o1", cluster_ids: ["0", "1_1"] },
        { comment_id: "o2", cluster_ids: ["0", "1_1"] },
      ],
    });
    expect(r.clusters.map((c) => [c.id, c.parentId, c.opinionIds])).toEqual([
      ["1_1", null, ["o1", "o2"]],
      ["2_1", "1_1", ["o1"]],
    ]);
  });

  it("形式不正の結果は拒否する", () => {
    expect(() => parseKouchouResult({})).toThrow();
  });

  it("開始・状態確認・結果取得でAPIを正しく呼ぶ", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchStub = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/admin/reports")) return new Response("{}", { status: 202 });
      if (url.endsWith("/status/step-json")) return Response.json({ status: "error", error_message: "壊れた" });
      return Response.json({ clusters: [], arguments: [], overview: "" });
    }) as unknown as typeof fetch;
    const p = new KouchouAiProvider({
      baseUrl: "http://k/",
      adminApiKey: "k",
      llmProvider: "gemini",
      model: "m",
      prompts: { extraction: "e", initialLabelling: "i", mergeLabelling: "m", overview: "o" },
      fetch: fetchStub,
    });
    const { providerRunId } = await p.start({
      runId: "run/1",
      sessionId: "s",
      question: "問い",
      opinions: [{ id: "o1", kind: "idea", body: "本文" }],
    });
    expect(providerRunId).toBe("opm-run-1");
    const sent = JSON.parse(calls[0]!.init!.body as string);
    expect(sent.comments).toEqual([{ id: "o1", comment: "本文" }]);
    expect(sent.prompt.initial_labelling).toBe("i");
    expect((calls[0]!.init!.headers as Record<string, string>)["x-api-key"]).toBe("k");
    const state = await p.poll(providerRunId);
    expect(state).toMatchObject({ status: "failed", errorSummary: "壊れた" });
    expect((await p.fetchResult(providerRunId, [])).clusters).toEqual([]);
  });
});
