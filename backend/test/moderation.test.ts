import { describe, expect, it } from "vitest";
import { FakeAnalysisProvider } from "../../core/src/analysis/fakeProvider.js";
import { createTestApp, newSubmissionId } from "./helpers.js";

const KEY = "k".repeat(22);
const OTHER_KEY = "o".repeat(22);

async function setup(options: Parameters<typeof createTestApp>[0] = {}) {
  const t = createTestApp({ analysisProvider: new FakeAnalysisProvider(), ...options });
  const s = await t.openSession();
  const post = (body = "意見", editKey = KEY, submissionId = newSubmissionId()) =>
    t.call("POST", `/sessions/${s.sessionId}/opinions`, {
      body: { submissionId, kind: "idea", body, ...(editKey ? { editKey } : {}) },
    });
  return { ...t, ...s, post };
}

describe("投稿頻度の制限", () => {
  it("テーマごとの上限を超えると429になり、時間が経つと再び投稿できる", async () => {
    let now = Date.UTC(2026, 0, 1);
    const { post, call, sessionId } = await setup({
      opinionRateLimit: { max: 2, windowSeconds: 60 },
      now: () => new Date(now),
    });
    expect((await post("1")).statusCode).toBe(201);
    expect((await post("2")).statusCode).toBe(201);
    const limited = await post("3");
    expect(limited.statusCode).toBe(429);
    expect(limited.json.error.code).toBe("rate_limited");
    now += 61_000;
    expect((await post("4")).statusCode).toBe(201);
    expect((await call("GET", `/sessions/${sessionId}/opinions`, { admin: true })).json.opinions).toHaveLength(3);
  });

  it("同じ送信IDの再送は、制限されない", async () => {
    const { post } = await setup({ opinionRateLimit: { max: 1, windowSeconds: 60 } });
    const id = newSubmissionId();
    expect((await post("1", KEY, id)).statusCode).toBe(201);
    const retry = await post("1", KEY, id);
    expect(retry.statusCode).toBe(200);
    expect(retry.json.duplicate).toBe(true);
  });

  it("別のテーマには影響しない", async () => {
    const t = await setup({ opinionRateLimit: { max: 1, windowSeconds: 60 } });
    await t.post("1");
    const other = await t.openSession();
    const res = await t.call("POST", `/sessions/${other.sessionId}/opinions`, {
      body: { submissionId: newSubmissionId(), kind: "idea", body: "別" },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe("投稿者による編集・削除", () => {
  it("鍵が合えば編集できる。応答に鍵のハッシュは含まれない", async () => {
    const { post, call, sessionId } = await setup();
    const id = (await post("元の意見")).json.opinion.id;
    const res = await call("PATCH", `/opinions/${id}`, { body: { editKey: KEY, body: "直した意見", kind: "question" } });
    expect(res.statusCode).toBe(200);
    expect(res.json.opinion).toMatchObject({ body: "直した意見", kind: "question" });
    expect(res.body).not.toContain(KEY);
    const list = await call("GET", `/sessions/${sessionId}/opinions`);
    expect(list.json.opinions[0].body).toBe("直した意見");
  });

  it("鍵が違う・ない・投稿が存在しないときは、同じ403を返す", async () => {
    const { post, call } = await setup();
    const id = (await post()).json.opinion.id;
    const noKey = (await post("鍵なし", "")).json.opinion.id;
    const bodies = [
      await call("PATCH", `/opinions/${id}`, { body: { editKey: OTHER_KEY, body: "x" } }),
      await call("PATCH", `/opinions/${noKey}`, { body: { editKey: KEY, body: "x" } }),
      await call("PATCH", "/opinions/none", { body: { editKey: KEY, body: "x" } }),
      await call("POST", `/opinions/${id}/delete`, { body: { editKey: OTHER_KEY } }),
    ];
    for (const res of bodies) {
      expect(res.statusCode).toBe(403);
      expect(res.json.error.code).toBe("invalid_edit_key");
    }
  });

  it("形式の違う鍵は400", async () => {
    const { post, call } = await setup();
    const id = (await post()).json.opinion.id;
    expect((await call("PATCH", `/opinions/${id}`, { body: { editKey: "短い", body: "x" } })).statusCode).toBe(400);
    expect((await post("x", "短い")).statusCode).toBe(400);
  });

  it("受け付けを終えたテーマでは編集できないが、削除はできる", async () => {
    const { post, call, sessionId } = await setup();
    const id = (await post()).json.opinion.id;
    await call("PATCH", `/sessions/${sessionId}`, { admin: true, body: { status: "closed" } });
    expect((await call("PATCH", `/opinions/${id}`, { body: { editKey: KEY, body: "x" } })).statusCode).toBe(403);
    expect((await call("POST", `/opinions/${id}/delete`, { body: { editKey: KEY } })).statusCode).toBe(200);
  });

  it("削除すると、一覧から消え、同じ鍵では二度と操作できず、過去の分析の記録からも本文が消える", async () => {
    const { post, call, sessionId } = await setup();
    const id = (await post("消したい本文")).json.opinion.id;
    await post("残る本文", OTHER_KEY);
    const run = (await call("POST", `/sessions/${sessionId}/analyses`, { admin: true })).json;
    await call("GET", `/analyses/${run.id}`, { admin: true });
    expect((await call("POST", `/opinions/${id}/delete`, { body: { editKey: KEY } })).statusCode).toBe(200);
    const list = await call("GET", `/sessions/${sessionId}/opinions`, { admin: true });
    expect(list.json.opinions.map((o: any) => o.body)).toEqual(["残る本文"]);
    expect((await call("POST", `/opinions/${id}/delete`, { body: { editKey: KEY } })).statusCode).toBe(403);
    const after = await call("GET", `/analyses/${run.id}`, { admin: true });
    expect(after.body).not.toContain("消したい本文");
  });
});

describe("運営者による非表示・削除", () => {
  it("非表示にすると参加者の一覧と分析から外れ、運営者の一覧には印付きで残り、戻せる", async () => {
    const { post, call, sessionId } = await setup();
    const id = (await post("問題のある投稿")).json.opinion.id;
    await post("普通の投稿", OTHER_KEY);
    const hide = await call("POST", `/opinions/${id}/moderation`, { admin: true, body: { status: "hidden" } });
    expect(hide.statusCode).toBe(200);
    const participant = await call("GET", `/sessions/${sessionId}/opinions`);
    expect(participant.json.opinions.map((o: any) => o.body)).toEqual(["普通の投稿"]);
    const admin = await call("GET", `/sessions/${sessionId}/opinions`, { admin: true });
    expect(admin.json.opinions.map((o: any) => [o.body, o.status])).toEqual([["問題のある投稿", "hidden"], ["普通の投稿", "active"]]);
    const run = (await call("POST", `/sessions/${sessionId}/analyses`, { admin: true })).json;
    expect(run.inputCount).toBe(1);
    await call("POST", `/opinions/${id}/moderation`, { admin: true, body: { status: "active" } });
    expect((await call("GET", `/sessions/${sessionId}/opinions`)).json.opinions).toHaveLength(2);
  });

  it("削除すると本文が消え、戻せない", async () => {
    const { post, call, sessionId } = await setup();
    const id = (await post("消す")).json.opinion.id;
    expect((await call("POST", `/opinions/${id}/moderation`, { admin: true, body: { status: "deleted" } })).statusCode).toBe(200);
    expect((await call("GET", `/sessions/${sessionId}/opinions`, { admin: true })).json.opinions).toHaveLength(0);
    expect((await call("POST", `/opinions/${id}/moderation`, { admin: true, body: { status: "active" } })).statusCode).toBe(404);
  });

  it("管理者でなければ操作できず、不正な状態は400", async () => {
    const { post, call } = await setup();
    const id = (await post()).json.opinion.id;
    expect((await call("POST", `/opinions/${id}/moderation`, { body: { status: "hidden" } })).statusCode).toBe(401);
    expect((await call("POST", `/opinions/${id}/moderation`, { admin: true, body: { status: "x" } })).statusCode).toBe(400);
  });

  it("運営者は、担当外のイベントの投稿を操作できない", async () => {
    const { post, call } = await setup();
    const id = (await post()).json.opinion.id;
    const other = (await call("POST", "/events", { admin: true, body: { name: "別" } })).json;
    const token = (await call("POST", `/events/${other.id}/operator-tokens`, { admin: true, body: { label: "x" } })).json.token;
    const res = await call("POST", `/opinions/${id}/moderation`, {
      headers: { authorization: `Bearer ${token}` },
      body: { status: "hidden" },
    });
    expect(res.statusCode).toBe(403);
  });
});
