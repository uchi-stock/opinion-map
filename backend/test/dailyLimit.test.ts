import { describe, expect, it } from "vitest";
import { FakeAnalysisProvider } from "../../core/src/analysis/fakeProvider.js";
import { FakeInsightProvider } from "../../core/src/insights/fakeProvider.js";
import { jstDayKey, nextJstMidnightIso } from "../../core/src/lib/dayKey.js";
import { createTestApp, newSubmissionId } from "./helpers.js";

describe("日本時間の日付", () => {
  it("UTCの15時で、日本の翌日になる。次の0時を返す", () => {
    expect(jstDayKey(new Date("2026-01-01T14:59:59Z"))).toBe("2026-01-01");
    expect(jstDayKey(new Date("2026-01-01T15:00:00Z"))).toBe("2026-01-02");
    expect(nextJstMidnightIso(new Date("2026-01-01T03:00:00Z"))).toBe("2026-01-01T15:00:00.000Z");
    expect(nextJstMidnightIso(new Date("2026-01-01T15:00:00Z"))).toBe("2026-01-02T15:00:00.000Z");
  });
});

describe("AIの利用の1日の上限(API)", () => {
  async function setup(limits: { analysis?: number; insight?: number }, nowIso = "2026-01-01T03:00:00Z") {
    let now = new Date(nowIso).getTime();
    const t = createTestApp({
      analysisProvider: new FakeAnalysisProvider(),
      insightProvider: new FakeInsightProvider(),
      dailyLimits: limits,
      now: () => new Date(now),
    });
    const a = await t.openSession();
    await t.call("POST", `/sessions/${a.sessionId}/opinions`, { body: { submissionId: newSubmissionId(), kind: "idea", body: "意見A" } });
    await t.call("POST", `/sessions/${a.sessionId}/opinions`, { body: { submissionId: newSubmissionId(), kind: "idea", body: "意見B" } });
    // 同じセッションで、続けて始められるよう、前の実行を完了させてから始める
    const analyze = async () => {
      const res = await t.call("POST", `/sessions/${a.sessionId}/analyses`, { admin: true });
      if (res.statusCode === 202) await t.call("GET", `/analyses/${res.json.id}`, { admin: true });
      return res;
    };
    const usage = () => t.call("GET", `/events/${a.eventId}/usage`, { admin: true });
    return { ...t, ...a, analyze, usage, advance: (ms: number) => (now += ms) };
  }

  it("上限までは分析を始められ、超えると429。メッセージに上限と戻る時刻の案内が出る", async () => {
    const t = await setup({ analysis: 2 });
    expect((await t.analyze()).statusCode).toBe(202);
    expect((await t.analyze()).statusCode).toBe(202);
    const denied = await t.analyze();
    expect(denied.statusCode).toBe(429);
    expect(denied.json.error.code).toBe("daily_limit");
    expect(denied.json.error.message).toContain("2回");
    expect(denied.json.error.message).toContain("0時");
  });

  it("上限は、日本時間の日付が変わると戻る", async () => {
    const t = await setup({ analysis: 1 });
    expect((await t.analyze()).statusCode).toBe(202);
    expect((await t.analyze()).statusCode).toBe(429);
    t.advance(13 * 60 * 60 * 1000); // 03:00Z → 16:00Z(日本の翌日)
    expect((await t.analyze()).statusCode).toBe(202);
  });

  it("利用状況を、運営者が確認できる。認証なしは401", async () => {
    const t = await setup({ analysis: 3, insight: 5 });
    await t.analyze();
    const res = await t.usage();
    expect(res.statusCode).toBe(200);
    expect(res.json.analysis).toEqual({ used: 1, limit: 3 });
    expect(res.json.insight).toEqual({ used: 0, limit: 5 });
    expect(res.json.resetsAt).toBe("2026-01-01T15:00:00.000Z");
    expect((await t.call("GET", `/events/${t.eventId}/usage`)).statusCode).toBe(401);
  });

  it("案の生成にも上限がある。超えると429で、AIは呼ばれない", async () => {
    const insightProvider = new FakeInsightProvider();
    const t0 = createTestApp({ analysisProvider: new FakeAnalysisProvider(), insightProvider, dailyLimits: { insight: 1 } });
    const a = await t0.openSession();
    for (const body of ["意見A", "意見B"]) {
      await t0.call("POST", `/sessions/${a.sessionId}/opinions`, { body: { submissionId: newSubmissionId(), kind: "idea", body } });
    }
    const run = (await t0.call("POST", `/sessions/${a.sessionId}/analyses`, { admin: true })).json;
    const done = (await t0.call("GET", `/analyses/${run.id}`, { admin: true })).json;
    const clusterId = done.result.clusters[0].id as string;
    const generate = () => t0.call("POST", `/analyses/${run.id}/clusters/${clusterId}/insights`, { admin: true });
    expect((await generate()).statusCode).toBe(201);
    const calls = insightProvider.requests.length;
    const denied = await generate();
    expect(denied.statusCode).toBe(429);
    expect(denied.json.error.code).toBe("daily_limit");
    expect(insightProvider.requests.length).toBe(calls);
  });

  it("同時に始めても、上限を超えない", async () => {
    const t = await setup({ analysis: 3 });
    const other = await t.openSession();
    await t.call("POST", `/sessions/${other.sessionId}/opinions`, { body: { submissionId: newSubmissionId(), kind: "idea", body: "別の意見" } });
    const results = await Promise.all(
      Array.from({ length: 6 }, () => t.call("POST", `/sessions/${t.sessionId}/analyses`, { admin: true })),
    );
    const accepted = results.filter((r) => r.statusCode === 202).length;
    // 同じセッションは、同時に1つしか実行できない。受理された数は、上限を超えない
    expect(accepted).toBeLessThanOrEqual(3);
    expect((await t.usage()).json.analysis.used).toBeLessThanOrEqual(3);
  });

  it("上限が0なら、すべて拒否する(AIを止める)", async () => {
    const t = await setup({ analysis: 0 });
    expect((await t.analyze()).statusCode).toBe(429);
  });
});
