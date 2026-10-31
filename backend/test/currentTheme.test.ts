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

  it("下書きのイベントは、まだ始まっていないと伝える。名前や中身は返さない", async () => {
    const t = createTestApp();
    const event = (await t.call("POST", "/events", { admin: true, body: { name: "準備中の名前" } })).json;
    const res = await t.call("GET", `/events/${event.id}/public`);
    expect(res.statusCode).toBe(200);
    expect(res.json).toMatchObject({ id: event.id, status: "draft", name: "", sessions: [] });
    expect(res.body).not.toContain("準備中の名前");
    expect((await t.call("GET", "/events/nope/public")).statusCode).toBe(404);
    await t.call("PATCH", `/events/${event.id}`, { admin: true, body: { status: "active" } });
    expect((await t.call("GET", `/events/${event.id}/public`)).json.status).toBe("active");
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
});

describe("複数のテーマを同時に開く(OST・API)", () => {
  async function setup() {
    const t = createTestApp();
    const event = (await t.call("POST", "/events", { admin: true, body: { name: "OST" } })).json;
    await t.call("PATCH", `/events/${event.id}`, { admin: true, body: { status: "active" } });
    const make = async (title: string, status = "active") => {
      const s = (await t.call("POST", `/events/${event.id}/sessions`, { admin: true, body: { title, prompt: `${title}の問い` } })).json;
      await t.call("PATCH", `/sessions/${s.id}`, { admin: true, body: { status } });
      return s.id as string;
    };
    const a = await make("場A");
    const b = await make("場B");
    const c = await make("場C");
    const draft = await make("下書き", "draft");
    const post = (sessionId: string) =>
      t.call("POST", `/sessions/${sessionId}/opinions`, { body: { submissionId: newSubmissionId(), body: "意見", kind: "idea" } });
    const open = (ids: string[] | null) =>
      t.call("PATCH", `/events/${event.id}`, { admin: true, body: { openSessionIds: ids } });
    return { ...t, eventId: event.id as string, a, b, c, draft, post, open };
  }

  it("複数のテーマに同時に投稿できる。開いていないテーマには投稿できない", async () => {
    const t = await setup();
    expect((await t.open([t.a, t.b])).statusCode).toBe(200);
    expect((await t.post(t.a)).statusCode).toBe(201);
    expect((await t.post(t.b)).statusCode).toBe(201);
    expect((await t.post(t.c)).statusCode).toBe(403);
  });

  it("公開情報に、開いているテーマと、場ごとの意見の数が出る", async () => {
    const t = await setup();
    await t.open([t.a, t.c]);
    await t.post(t.a);
    await t.post(t.a);
    const info = (await t.call("GET", `/events/${t.eventId}/public`)).json;
    expect(info.openSessionIds).toEqual([t.a, t.c]);
    const byId = Object.fromEntries(info.sessions.map((s: { id: string }) => [s.id, s]));
    expect(byId[t.a].isOpen).toBe(true);
    expect(byId[t.b].isOpen).toBe(false);
    expect(byId[t.a].opinionCount).toBe(2);
    expect(byId[t.b].opinionCount).toBe(0);
  });

  it("閉じたテーマの意見は、見られる", async () => {
    const t = await setup();
    await t.open([t.a]);
    await t.post(t.a);
    await t.open([t.b]);
    const list = (await t.call("GET", `/sessions/${t.a}/opinions`)).json;
    expect(list.opinions).toHaveLength(1);
    expect((await t.post(t.a)).statusCode).toBe(403);
  });

  it("下書き・他のイベントのテーマは開けない。重複は1つにまとめ、解除できる", async () => {
    const t = await setup();
    expect((await t.open([t.draft])).statusCode).toBe(400);
    expect((await t.open(["nope"])).statusCode).toBe(400);
    const other = await t.openSession();
    expect((await t.open([other.sessionId])).statusCode).toBe(400);
    expect((await t.call("PATCH", `/events/${t.eventId}`, { admin: true, body: { openSessionIds: "x" } })).statusCode).toBe(400);
    const dup = (await t.open([t.a, t.a])).json;
    expect(dup.openSessionIds).toEqual([t.a]);
    const cleared = await t.open(null);
    expect(cleared.json.openSessionIds).toBeUndefined();
    expect((await t.post(t.c)).statusCode).toBe(201);
  });

  it("空の配列にすると、どのテーマも開かない", async () => {
    const t = await setup();
    await t.open([]);
    expect((await t.post(t.a)).statusCode).toBe(403);
  });

  it("古い currentSessionId の指定は、そのテーマ1つだけを開く", async () => {
    const t = await setup();
    await t.open([t.a, t.b]);
    await t.call("PATCH", `/events/${t.eventId}`, { admin: true, body: { currentSessionId: t.c } });
    const info = (await t.call("GET", `/events/${t.eventId}/public`)).json;
    expect(info.openSessionIds).toEqual([t.c]);
    expect(info.currentSessionId).toBe(t.c);
  });
});
