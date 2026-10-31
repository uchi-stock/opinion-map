import { describe, expect, it } from "vitest";
import { FakeAnalysisProvider } from "../../core/src/analysis/fakeProvider.js";
import { FakeInsightProvider } from "../../core/src/insights/fakeProvider.js";
import { createTestApp, newSubmissionId } from "./helpers.js";

describe("要約のビュー(参加者向けAPI)", () => {
  async function setup(sessionBody: Record<string, unknown> = {}) {
    const t = createTestApp({ analysisProvider: new FakeAnalysisProvider(), insightProvider: new FakeInsightProvider() });
    const a = await t.openSession(sessionBody);
    for (const body of ["意見A", "意見B", "意見C"]) {
      await t.call("POST", `/sessions/${a.sessionId}/opinions`, { body: { submissionId: newSubmissionId(), kind: "idea", body } });
    }
    const run = (await t.call("POST", `/sessions/${a.sessionId}/analyses`, { admin: true })).json;
    const done = (await t.call("GET", `/analyses/${run.id}`, { admin: true })).json;
    const clusterId = done.result.clusters[0].id as string;
    const publish = (published: boolean) => t.call("PATCH", `/sessions/${a.sessionId}`, { admin: true, body: { summaryPublished: published } });
    const summary = () => t.call("GET", `/sessions/${a.sessionId}/summary`);
    return { ...t, ...a, runId: run.id as string, clusterId, publish, summary, done };
  }

  it("公開するまで、要約の内容は返さない。公開の有無だけ", async () => {
    const t = await setup();
    const res = await t.summary();
    expect(res.statusCode).toBe(200);
    expect(res.json).toEqual({ published: false });
    expect(res.body).not.toContain("意見A");
  });

  it("公開すると、概要とクラスタの要約、元の投稿のIDを返す。投稿の本文は返さない", async () => {
    const t = await setup();
    await t.publish(true);
    const s = (await t.summary()).json;
    expect(s.published).toBe(true);
    expect(s.overview).toBe(t.done.result.overview);
    expect(s.clusters.length).toBe(t.done.result.clusters.length);
    expect(s.clusters[0].opinionCount).toBeGreaterThan(0);
    expect(s.clusters[0].opinionIds.length).toBe(s.clusters[0].opinionCount);
    expect(s.unclassifiedCount).toBe(t.done.result.unclassifiedOpinionIds.length);
    expect(s.newOpinionCount).toBe(0);
    expect(JSON.stringify(s)).not.toContain("意見A");
  });

  it("採用された案だけを返す。編集があれば、編集後の内容", async () => {
    const t = await setup();
    const created = (await t.call("POST", `/analyses/${t.runId}/clusters/${t.clusterId}/insights`, { admin: true })).json;
    await t.publish(true);
    expect((await t.summary()).json.insights).toEqual([]);
    const edited = { commonPoints: ["編集した共通点"], differences: [], premiseDifferences: [], questions: ["編集した問い"] };
    await t.call("PATCH", `/insights/${created.id}`, { admin: true, body: { edited, approved: true } });
    const insights = (await t.summary()).json.insights;
    expect(insights).toHaveLength(1);
    expect(insights[0].clusterId).toBe(t.clusterId);
    expect(insights[0].content.commonPoints).toEqual(["編集した共通点"]);
  });

  it("分析のあとに増えた投稿の数を返す", async () => {
    const t = await setup();
    await t.publish(true);
    await t.call("POST", `/sessions/${t.sessionId}/opinions`, { body: { submissionId: newSubmissionId(), kind: "idea", body: "あとから" } });
    expect((await t.summary()).json.newOpinionCount).toBe(1);
  });

  it("意見を参加者に見せない設定のときは、元の投稿のIDも返さない", async () => {
    const t = await setup({ showOpinionsToParticipants: false });
    await t.publish(true);
    const s = (await t.summary()).json;
    expect(s.published).toBe(true);
    expect(s.clusters[0].opinionIds).toBeUndefined();
    expect(s.unclassifiedOpinionIds).toBeUndefined();
    expect(s.clusters[0].opinionCount).toBeGreaterThan(0);
  });

  it("分析の結果が無ければ、公開しても、内容は返さない。公開の切り替えは運営者だけ", async () => {
    const t = createTestApp({ analysisProvider: new FakeAnalysisProvider() });
    const a = await t.openSession();
    expect((await t.call("PATCH", `/sessions/${a.sessionId}`, { body: { summaryPublished: true } })).statusCode).toBe(401);
    await t.call("PATCH", `/sessions/${a.sessionId}`, { admin: true, body: { summaryPublished: true } });
    expect((await t.call("GET", `/sessions/${a.sessionId}/summary`)).json).toEqual({ published: false });
    expect((await t.call("PATCH", `/sessions/${a.sessionId}`, { admin: true, body: { summaryPublished: "x" } })).statusCode).toBe(400);
  });

  it("存在しない、または下書きのテーマは404", async () => {
    const t = createTestApp();
    expect((await t.call("GET", "/sessions/nope/summary")).statusCode).toBe(404);
  });
});
