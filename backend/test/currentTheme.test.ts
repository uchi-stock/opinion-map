import { describe, expect, it } from "vitest";
import { createTestApp, newSubmissionId } from "./helpers.js";

describe("イベントの招待URLと、いまのテーマ(API)", () => {
  async function setup() {
    const t = createTestApp();
    const event = (await t.call("POST", "/events", { admin: true, body: { name: "ワークショップ" } })).json;
    await t.call("PATCH", `/events/${event.id}`, { admin: true, body: { status: "active" } });
    const make = async (title: string, status: string) => {
      const s = (await t.call("POST", `/events/${event.id}/sessions`, { admin: true, body: { title, prompt: `${title}の問い` } })).json;
      await t.call("PATCH", `/sessions/${s.id}`, { admin: true, body: { status } });
      return s.id as string;
    };
    const a = await make("テーマA", "active");
    const b = await make("テーマB", "active");
    const draft = await make("下書き", "draft");
    const post = (sessionId: string, body = "意見") =>
      t.call("POST", `/sessions/${sessionId}/opinions`, { body: { submissionId: newSubmissionId(), body, kind: "idea" } });
    const setCurrent = (value: string | null) =>
      t.call("PATCH", `/events/${event.id}`, { admin: true, body: { currentSessionId: value } });
    return { ...t, eventId: event.id as string, a, b, draft, post, setCurrent };
  }

  it("招待URL用に、下書き以外のテーマの一覧と、いまのテーマを返す。認証は要らない", async () => {
    const t = await setup();
    const res = await t.call("GET", `/events/${t.eventId}/public`);
    expect(res.statusCode).toBe(200);
    expect(res.json.name).toBe("ワークショップ");
    expect(res.json.currentSessionId).toBeNull();
    expect(res.json.sessions.map((s: { title: string }) => s.title)).toEqual(["テーマA", "テーマB"]);
    await t.setCurrent(t.b);
    const after = (await t.call("GET", `/events/${t.eventId}/public`)).json;
    expect(after.currentSessionId).toBe(t.b);
    expect(after.sessions.map((s: { isCurrent: boolean }) => s.isCurrent)).toEqual([false, true]);
  });

  it("下書きのイベントは、存在しないものとして扱う", async () => {
    const t = createTestApp();
    const event = (await t.call("POST", "/events", { admin: true, body: { name: "準備中" } })).json;
    expect((await t.call("GET", `/events/${event.id}/public`)).statusCode).toBe(404);
  });

  it("いまのテーマにだけ投稿できる。切り替えると、前のテーマには投稿できない", async () => {
    const t = await setup();
    await t.setCurrent(t.a);
    expect((await t.post(t.a)).statusCode).toBe(201);
    const denied = await t.post(t.b);
    expect(denied.statusCode).toBe(403);
    expect(denied.json.error.code).toBe("not_accepting");
    await t.setCurrent(t.b);
    expect((await t.post(t.b)).statusCode).toBe(201);
    expect((await t.post(t.a)).statusCode).toBe(403);
  });

  it("参加者は、いまのテーマでないテーマの意見も見られる", async () => {
    const t = await setup();
    await t.setCurrent(t.a);
    await t.post(t.a, "Aの意見");
    await t.setCurrent(t.b);
    const list = (await t.call("GET", `/sessions/${t.a}/opinions`)).json;
    expect(list.opinions.map((o: { body: string }) => o.body)).toEqual(["Aの意見"]);
    const session = (await t.call("GET", `/sessions/${t.a}`)).json;
    expect(session.acceptingOpinions).toBe(false);
    expect(session.eventId).toBe(t.eventId);
  });

  it("いまのテーマが未設定なら、従来どおり、公開中のテーマすべてに投稿できる", async () => {
    const t = await setup();
    expect((await t.post(t.a)).statusCode).toBe(201);
    expect((await t.post(t.b)).statusCode).toBe(201);
  });

  it("他のイベントのテーマや、下書きのテーマは、いまのテーマにできない。解除もできる", async () => {
    const t = await setup();
    expect((await t.setCurrent(t.draft)).statusCode).toBe(400);
    expect((await t.setCurrent("nope")).statusCode).toBe(400);
    const other = await t.openSession();
    expect((await t.setCurrent(other.sessionId)).statusCode).toBe(400);
    expect((await t.call("PATCH", `/events/${t.eventId}`, { admin: true, body: { currentSessionId: 5 } })).statusCode).toBe(400);
    await t.setCurrent(t.a);
    const cleared = await t.setCurrent(null);
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json.currentSessionId).toBeUndefined();
    expect((await t.post(t.b)).statusCode).toBe(201);
  });

  it("運営者のリンクは、担当のイベントのテーマを切り替えられる。認証なしは401", async () => {
    const t = await setup();
    expect((await t.call("PATCH", `/events/${t.eventId}`, { body: { currentSessionId: t.a } })).statusCode).toBe(401);
    const issued = (await t.call("POST", `/events/${t.eventId}/operator-tokens`, { admin: true, body: { label: "進行" } })).json;
    const res = await t.call("PATCH", `/events/${t.eventId}`, {
      headers: { authorization: `Bearer ${issued.token}` },
      body: { currentSessionId: t.a },
    });
    expect(res.statusCode).toBe(200);
  });
});
