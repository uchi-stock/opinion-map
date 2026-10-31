import { describe, expect, it } from "vitest";
import { FakeAnalysisProvider } from "../../core/src/analysis/fakeProvider.js";
import { createTestApp, newSubmissionId } from "./helpers.js";

/** 時刻を手で進められる、テスト用の時計 */
function clock() {
  let t = Date.UTC(2026, 0, 1, 0, 0, 0);
  return { now: () => new Date(t), advance: (seconds: number) => void (t += seconds * 1000) };
}

async function setup(timerSeconds: number | undefined, withAnalysis = true) {
  const c = clock();
  const t = createTestApp({ now: c.now, ...(withAnalysis ? { analysisProvider: new FakeAnalysisProvider() } : {}) });
  const event = (await t.call("POST", "/events", { admin: true, body: { name: "E" } })).json;
  await t.call("PATCH", `/events/${event.id}`, { admin: true, body: { status: "active" } });
  const session = (
    await t.call("POST", `/events/${event.id}/sessions`, {
      admin: true,
      body: { title: "T", prompt: "問い", ...(timerSeconds === undefined ? {} : { timerSeconds }) },
    })
  ).json;
  const post = (body = "意見") =>
    t.call("POST", `/sessions/${session.id}/opinions`, { body: { submissionId: newSubmissionId(), kind: "idea", body } });
  const open = () => t.call("PATCH", `/sessions/${session.id}`, { admin: true, body: { status: "active" } });
  return { ...t, c, sessionId: session.id as string, post, open };
}

describe("制限時間（タイマー）", () => {
  it("設定しなければ、締め切りはない", async () => {
    const s = await setup(undefined);
    await s.open();
    s.c.advance(100000);
    expect((await s.post()).statusCode).toBe(201);
    expect(await s.app.sweepTimers()).toBe(0);
  });

  it("下書きの間は数えない。公開中にした時点から数え、締め切りを公開情報に出す", async () => {
    const s = await setup(600);
    s.c.advance(3600);
    const open = await s.open();
    expect(open.json.deadlineAt).toBe(new Date(s.c.now().getTime() + 600_000).toISOString());
    const pub = await s.call("GET", `/sessions/${s.sessionId}`);
    expect(pub.json.deadlineAt).toBe(open.json.deadlineAt);
    expect(pub.json.serverNow).toBe(s.c.now().toISOString());
  });

  it("時間が来たら、サーバーが投稿を断る", async () => {
    const s = await setup(60);
    await s.open();
    expect((await s.post()).statusCode).toBe(201);
    s.c.advance(61);
    const res = await s.post("遅れた投稿");
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect((await s.call("GET", `/sessions/${s.sessionId}`)).json.acceptingOpinions).toBe(false);
  });

  it("定期処理が、締め切りを過ぎたテーマを閉じて、分析を始める", async () => {
    const s = await setup(60);
    await s.open();
    await s.post();
    expect(await s.app.sweepTimers()).toBe(0);
    s.c.advance(61);
    expect(await s.app.sweepTimers()).toBe(1);
    const session = (await s.call("GET", `/sessions/${s.sessionId}`)).json;
    expect(session.status).toBe("closed");
    const runs = (await s.call("GET", `/sessions/${s.sessionId}/analyses`, { admin: true })).json.analyses;
    expect(runs).toHaveLength(1);
    // 2回目は、何もしない
    expect(await s.app.sweepTimers()).toBe(0);
  });

  it("投稿が0件なら、閉じるだけで分析しない", async () => {
    const s = await setup(60);
    await s.open();
    s.c.advance(61);
    expect(await s.app.sweepTimers()).toBe(1);
    expect((await s.call("GET", `/sessions/${s.sessionId}/analyses`, { admin: true })).json.analyses).toHaveLength(0);
  });

  it("分析の基盤がなくても、閉じられる", async () => {
    const s = await setup(60, false);
    await s.open();
    await s.post();
    s.c.advance(61);
    expect(await s.app.sweepTimers()).toBe(1);
  });

  it("制限時間は、後から変更・解除できる。範囲外は拒否する", async () => {
    const s = await setup(undefined);
    expect((await s.call("PATCH", `/sessions/${s.sessionId}`, { admin: true, body: { timerSeconds: 5 } })).statusCode).toBe(400);
    const set = await s.call("PATCH", `/sessions/${s.sessionId}`, { admin: true, body: { timerSeconds: 300 } });
    expect(set.json.timerSeconds).toBe(300);
    const cleared = await s.call("PATCH", `/sessions/${s.sessionId}`, { admin: true, body: { timerSeconds: null } });
    expect(cleared.json.timerSeconds).toBeUndefined();
  });

  it("公開をやめると、締め切りは消える。もう一度公開すると、数え直す", async () => {
    const s = await setup(60);
    await s.open();
    await s.call("PATCH", `/sessions/${s.sessionId}`, { admin: true, body: { status: "closed" } });
    s.c.advance(1000);
    const again = await s.open();
    expect(again.json.deadlineAt).toBe(new Date(s.c.now().getTime() + 60_000).toISOString());
  });
});
