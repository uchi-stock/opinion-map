import { describe, expect, it } from "vitest";
import { FakeAnalysisProvider } from "../src/analysis/fakeProvider.js";
import { createTestApp, newSubmissionId } from "./helpers.js";

async function setup() {
  const t = createTestApp({ analysisProvider: new FakeAnalysisProvider() });
  const a = await t.openSession();
  const b = await t.openSession();
  const issue = async (eventId: string, label = "会場係") =>
    (await t.call("POST", `/events/${eventId}/operator-tokens`, { admin: true, body: { label } })).json;
  const asOperator = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
  return { ...t, a, b, issue, asOperator };
}

describe("運営者トークン", () => {
  it("発行したトークンの本体は、発行時だけ返し、一覧には出さない", async () => {
    const { call, a, issue } = await setup();
    const issued = await issue(a.eventId);
    expect(issued.token).toMatch(/^opm_[A-Za-z0-9_-]{43}$/);
    const list = await call("GET", `/events/${a.eventId}/operator-tokens`, { admin: true });
    expect(JSON.stringify(list.json)).not.toContain(issued.token);
    expect(list.json.tokens).toHaveLength(1);
  });

  it("発行ごとに別のトークンになる", async () => {
    const { a, issue } = await setup();
    expect((await issue(a.eventId)).token).not.toBe((await issue(a.eventId)).token);
  });

  it("名前が不正なら発行できない", async () => {
    const { call, a } = await setup();
    for (const label of ["", "  ", undefined, 1, "あ".repeat(51)]) {
      const res = await call("POST", `/events/${a.eventId}/operator-tokens`, { admin: true, body: { label } });
      expect(res.statusCode).toBe(400);
    }
  });

  it("存在しないイベントには発行できない", async () => {
    const { call } = await setup();
    const res = await call("POST", "/events/none/operator-tokens", { admin: true, body: { label: "x" } });
    expect(res.statusCode).toBe(404);
  });

  it("担当のイベントのセッション・投稿・分析を操作できる", async () => {
    const { call, a, issue, asOperator } = await setup();
    const { token } = await issue(a.eventId);
    const op = asOperator(token);
    await call("POST", `/sessions/${a.sessionId}/opinions`, {
      body: { submissionId: newSubmissionId(), kind: "idea", body: "意見" },
    });
    expect((await call("GET", "/me", op)).json).toEqual({ role: "operator", eventId: a.eventId });
    expect((await call("GET", `/events/${a.eventId}/sessions`, op)).statusCode).toBe(200);
    expect((await call("PATCH", `/sessions/${a.sessionId}`, { ...op, body: { title: "変更" } })).statusCode).toBe(200);
    const list = await call("GET", `/sessions/${a.sessionId}/opinions`, op);
    expect(list.json.opinions).toHaveLength(1);
    const run = await call("POST", `/sessions/${a.sessionId}/analyses`, op);
    expect(run.statusCode).toBe(202);
    expect((await call("GET", `/analyses/${run.json.id}`, op)).statusCode).toBe(200);
  });

  it("担当外のイベントは、操作できない", async () => {
    const { call, a, b, issue, asOperator } = await setup();
    const op = asOperator((await issue(a.eventId)).token);
    expect((await call("GET", `/events/${b.eventId}/sessions`, op)).statusCode).toBe(403);
    expect((await call("PATCH", `/events/${b.eventId}`, { ...op, body: { name: "x" } })).statusCode).toBe(403);
    expect((await call("PATCH", `/sessions/${b.sessionId}`, { ...op, body: { title: "x" } })).statusCode).toBe(403);
    expect((await call("POST", `/sessions/${b.sessionId}/analyses`, op)).statusCode).toBe(403);
    // 担当外のセッションの投稿は、参加者と同じ見え方にしかならない
    await call("PATCH", `/sessions/${b.sessionId}`, { admin: true, body: { showOpinionsToParticipants: false } });
    const own = await call("GET", `/sessions/${b.sessionId}/opinions`, op);
    expect(own.json.hidden).toBe(true);
  });

  it("存在しないものを指しても、運営者には403を返す（存在の有無を教えない）", async () => {
    const { call, a, issue, asOperator } = await setup();
    const op = asOperator((await issue(a.eventId)).token);
    expect((await call("PATCH", "/sessions/none", { ...op, body: { title: "x" } })).statusCode).toBe(403);
  });

  it("オーナー専用の操作はできない", async () => {
    const { call, a, issue, asOperator } = await setup();
    const op = asOperator((await issue(a.eventId)).token);
    expect((await call("POST", "/events", { ...op, body: { name: "新規" } })).statusCode).toBe(403);
    expect((await call("POST", `/events/${a.eventId}/operator-tokens`, { ...op, body: { label: "x" } })).statusCode).toBe(403);
    expect((await call("GET", `/events/${a.eventId}/operator-tokens`, op)).statusCode).toBe(403);
  });

  it("イベント一覧には、担当のイベントだけが出る", async () => {
    const { call, a, issue, asOperator } = await setup();
    const op = asOperator((await issue(a.eventId)).token);
    const list = (await call("GET", "/events", op)).json.events;
    expect(list.map((e: any) => e.id)).toEqual([a.eventId]);
  });

  it("失効したトークンは使えない。他のトークンは使える", async () => {
    const { call, a, issue, asOperator } = await setup();
    const first = await issue(a.eventId, "1");
    const second = await issue(a.eventId, "2");
    const revoked = await call("POST", `/operator-tokens/${first.id}/revoke`, { admin: true });
    expect(revoked.json.revokedAt).toBeTruthy();
    expect((await call("GET", "/me", asOperator(first.token))).statusCode).toBe(401);
    expect((await call("GET", "/me", asOperator(second.token))).statusCode).toBe(200);
    // 二重に失効しても、失敗しない
    expect((await call("POST", `/operator-tokens/${first.id}/revoke`, { admin: true })).statusCode).toBe(200);
  });

  it("形式の違うトークンや、でたらめなトークンは401", async () => {
    const { call } = await setup();
    for (const token of ["opm_", "opm_xxxxxxxx", "random", ""]) {
      expect((await call("GET", "/me", { headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
    }
  });

  it("オーナーのトークンは、/me でオーナーと分かる", async () => {
    const { call } = await setup();
    expect((await call("GET", "/me", { admin: true })).json).toEqual({ role: "owner" });
  });
});
