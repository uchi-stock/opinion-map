import { describe, expect, it } from "vitest";
import { MAX_BODY_BYTES } from "../../core/src/app.js";
import { ADMIN_TOKEN, createTestApp, createTestRepositories, newSubmissionId } from "./helpers.js";

describe("運営者の認証", () => {
  it("トークンなしで管理用のAPIを呼ぶと401", async () => {
    const { call } = createTestApp();
    expect((await call("POST", "/events", { body: { name: "A" } })).statusCode).toBe(401);
    expect((await call("GET", "/events")).statusCode).toBe(401);
  });

  it("誤ったトークンは401", async () => {
    const { call } = createTestApp();
    const res = await call("GET", "/events", { headers: { authorization: "Bearer wrong" } });
    expect(res.statusCode).toBe(401);
  });

  it("Bearer 形式でないと401", async () => {
    const { call } = createTestApp();
    const res = await call("GET", "/events", { headers: { authorization: ADMIN_TOKEN } });
    expect(res.statusCode).toBe(401);
  });

  it("トークンが未設定なら、常に401（安全側）", async () => {
    const { call } = createTestApp({ adminToken: undefined });
    const res = await call("GET", "/events", { headers: { authorization: "Bearer " } });
    expect(res.statusCode).toBe(401);
  });

  it("正しいトークンなら呼べる", async () => {
    const { call } = createTestApp();
    expect((await call("GET", "/events", { admin: true })).statusCode).toBe(200);
  });
});

describe("イベントとセッションの管理", () => {
  it("イベントは下書きで作られ、編集できる", async () => {
    const { call } = createTestApp();
    const created = await call("POST", "/events", { admin: true, body: { name: "A", description: "説明" } });
    expect(created.statusCode).toBe(201);
    expect(created.json.status).toBe("draft");
    const patched = await call("PATCH", `/events/${created.json.id}`, {
      admin: true,
      body: { name: "B", status: "active" },
    });
    expect(patched.json).toMatchObject({ name: "B", description: "説明", status: "active" });
    expect((await call("GET", "/events", { admin: true })).json.events).toHaveLength(1);
  });

  it("存在しないイベントは404", async () => {
    const { call } = createTestApp();
    expect((await call("PATCH", "/events/none", { admin: true, body: { name: "A" } })).statusCode).toBe(404);
    expect(
      (await call("POST", "/events/none/sessions", { admin: true, body: { title: "A", prompt: "Q" } })).statusCode,
    ).toBe(404);
  });

  it("セッションを作成・編集・一覧できる", async () => {
    const { call } = createTestApp();
    const event = (await call("POST", "/events", { admin: true, body: { name: "A" } })).json;
    const created = await call("POST", `/events/${event.id}/sessions`, {
      admin: true,
      body: { title: "S", prompt: "問い", format: "ost" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json).toMatchObject({ status: "draft", format: "ost", showOpinionsToParticipants: true });
    const patched = await call("PATCH", `/sessions/${created.json.id}`, { admin: true, body: { prompt: "新しい問い" } });
    expect(patched.json.prompt).toBe("新しい問い");
    const list = await call("GET", `/events/${event.id}/sessions`, { admin: true });
    expect(list.json.sessions).toHaveLength(1);
  });

  it("入力が正しくないと400", async () => {
    const { call } = createTestApp();
    const res = await call("POST", "/events", { admin: true, body: { name: "" } });
    expect(res.statusCode).toBe(400);
    expect(res.json.error.code).toBe("required");
  });
});

describe("参加者の投稿", () => {
  it("下書きのセッションは、参加者には存在しない", async () => {
    const { call } = createTestApp();
    const event = (await call("POST", "/events", { admin: true, body: { name: "A" } })).json;
    const session = (
      await call("POST", `/events/${event.id}/sessions`, { admin: true, body: { title: "S", prompt: "Q" } })
    ).json;
    expect((await call("GET", `/sessions/${session.id}`)).statusCode).toBe(404);
    const post = await call("POST", `/sessions/${session.id}/opinions`, {
      body: { body: "x", kind: "idea", submissionId: newSubmissionId() },
    });
    expect(post.statusCode).toBe(404);
  });

  it("ログインなしで投稿でき、一覧に出る", async () => {
    const { call, openSession } = createTestApp();
    const { sessionId } = await openSession();
    const session = await call("GET", `/sessions/${sessionId}`);
    expect(session.json).toMatchObject({ prompt: "問い", acceptingOpinions: true, eventName: "テストイベント" });

    const posted = await call("POST", `/sessions/${sessionId}/opinions`, {
      body: { body: "  最初の意見  ", kind: "experience", submissionId: newSubmissionId() },
    });
    expect(posted.statusCode).toBe(201);
    expect(posted.json.opinion).toMatchObject({ body: "最初の意見", kind: "experience" });

    const list = await call("GET", `/sessions/${sessionId}/opinions`);
    expect(list.json.opinions.map((o: any) => o.body)).toEqual(["最初の意見"]);
  });

  it("同じ送信IDの再送は、新しい投稿を作らない（二重送信の防止）", async () => {
    const { call, openSession } = createTestApp();
    const { sessionId } = await openSession();
    const submissionId = newSubmissionId();
    const payload = { body: "一度だけ", kind: "idea", submissionId };
    const first = await call("POST", `/sessions/${sessionId}/opinions`, { body: payload });
    const second = await call("POST", `/sessions/${sessionId}/opinions`, { body: payload });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json.duplicate).toBe(true);
    expect(second.json.opinion.id).toBe(first.json.opinion.id);
    expect((await call("GET", `/sessions/${sessionId}/opinions`)).json.opinions).toHaveLength(1);
  });

  it("送信IDが違えば、同じ本文でも別の投稿になる", async () => {
    const { call, openSession } = createTestApp();
    const { sessionId } = await openSession();
    for (let i = 0; i < 2; i++) {
      await call("POST", `/sessions/${sessionId}/opinions`, {
        body: { body: "同じ", kind: "idea", submissionId: newSubmissionId() },
      });
    }
    expect((await call("GET", `/sessions/${sessionId}/opinions`)).json.opinions).toHaveLength(2);
  });

  it("空・空白だけ・上限超過の投稿は400で、保存されない", async () => {
    const { call, openSession } = createTestApp();
    const { sessionId } = await openSession();
    for (const body of ["", "   ", "あ".repeat(301)]) {
      const res = await call("POST", `/sessions/${sessionId}/opinions`, {
        body: { body, kind: "idea", submissionId: newSubmissionId() },
      });
      expect(res.statusCode).toBe(400);
    }
    expect((await call("GET", `/sessions/${sessionId}/opinions`)).json.opinions).toHaveLength(0);
  });

  it("文字数の上限は、設定で変えられる", async () => {
    const { call, openSession } = createTestApp({ opinionMaxLength: 5 });
    const { sessionId } = await openSession();
    const res = await call("POST", `/sessions/${sessionId}/opinions`, {
      body: { body: "123456", kind: "idea", submissionId: newSubmissionId() },
    });
    expect(res.json.error.code).toBe("too_long");
  });

  it("終了したセッションには投稿できないが、閲覧はできる", async () => {
    const { call, openSession } = createTestApp();
    const { sessionId } = await openSession();
    await call("POST", `/sessions/${sessionId}/opinions`, {
      body: { body: "終了前", kind: "idea", submissionId: newSubmissionId() },
    });
    await call("PATCH", `/sessions/${sessionId}`, { admin: true, body: { status: "closed" } });
    const post = await call("POST", `/sessions/${sessionId}/opinions`, {
      body: { body: "終了後", kind: "idea", submissionId: newSubmissionId() },
    });
    expect(post.statusCode).toBe(403);
    expect(post.json.error.code).toBe("not_accepting");
    expect((await call("GET", `/sessions/${sessionId}`)).json.acceptingOpinions).toBe(false);
    expect((await call("GET", `/sessions/${sessionId}/opinions`)).json.opinions).toHaveLength(1);
  });

  it("アーカイブされたイベントには投稿できない", async () => {
    const { call, openSession } = createTestApp();
    const { sessionId, eventId } = await openSession();
    await call("PATCH", `/events/${eventId}`, { admin: true, body: { status: "archived" } });
    const post = await call("POST", `/sessions/${sessionId}/opinions`, {
      body: { body: "x", kind: "idea", submissionId: newSubmissionId() },
    });
    expect(post.statusCode).toBe(403);
  });

  it("一覧を見せない設定では、参加者には空を返し、運営者には返す", async () => {
    const { call, openSession } = createTestApp();
    const { sessionId } = await openSession({ showOpinionsToParticipants: false });
    await call("POST", `/sessions/${sessionId}/opinions`, {
      body: { body: "非公開の意見", kind: "idea", submissionId: newSubmissionId() },
    });
    const participant = await call("GET", `/sessions/${sessionId}/opinions`);
    expect(participant.json).toEqual({ hidden: true, opinions: [] });
    const admin = await call("GET", `/sessions/${sessionId}/opinions`, { admin: true });
    expect(admin.json.opinions).toHaveLength(1);
  });
});

describe("匿名性と安全性", () => {
  it("投稿の応答に、許可した項目だけが含まれる", async () => {
    const { call, openSession } = createTestApp();
    const { sessionId } = await openSession();
    const submissionId = newSubmissionId();
    const posted = await call("POST", `/sessions/${sessionId}/opinions`, {
      body: { body: "匿名の意見", kind: "idea", submissionId },
      headers: { "user-agent": "test-agent", "x-forwarded-for": "203.0.113.9" },
    });
    expect(Object.keys(posted.json.opinion).sort()).toEqual(["body", "createdAt", "id", "kind"]);
    // 運営者の一覧だけが、非表示かどうか(status)を持つ。参加者の一覧は、許可した項目だけ
    const list = await call("GET", `/sessions/${sessionId}/opinions`, { admin: true });
    expect(Object.keys(list.json.opinions[0]).sort()).toEqual(["body", "createdAt", "id", "kind", "reactionCount", "status"]);
    const participantList = await call("GET", `/sessions/${sessionId}/opinions`);
    expect(Object.keys(participantList.json.opinions[0]).sort()).toEqual(["body", "createdAt", "id", "kind", "reactionCount"]);
    for (const res of [posted, list, participantList]) {
      expect(res.body).not.toContain(submissionId);
      expect(res.body).not.toContain("203.0.113.9");
      expect(res.body).not.toContain("test-agent");
    }
  });

  it("保存される投稿に、IPアドレスやUser-Agentが含まれない", async () => {
    const repos = createTestRepositories();
    const { call, openSession } = createTestApp({ repos });
    const { sessionId } = await openSession();
    await call("POST", `/sessions/${sessionId}/opinions`, {
      body: { body: "x", kind: "idea", submissionId: newSubmissionId() },
      headers: { "user-agent": "test-agent", "x-forwarded-for": "203.0.113.9" },
    });
    const stored = JSON.stringify(await repos.opinions.listBySession(sessionId));
    expect(stored).not.toContain("203.0.113.9");
    expect(stored).not.toContain("test-agent");
  });

  it("HTMLやスクリプトは、文字列のまま保存・返却される（表示側でエスケープする）", async () => {
    const { call, openSession } = createTestApp();
    const { sessionId } = await openSession();
    const evil = `<script>alert("xss")</script><img src=x onerror=alert(1)>`;
    const posted = await call("POST", `/sessions/${sessionId}/opinions`, {
      body: { body: evil, kind: "idea", submissionId: newSubmissionId() },
    });
    expect(posted.statusCode).toBe(201);
    expect(posted.json.opinion.body).toBe(evil);
    expect(posted.headers["content-type"]).toContain("application/json");
    expect(posted.headers["x-content-type-options"]).toBe("nosniff");
    expect(posted.headers["cache-control"]).toBe("no-store");
  });

  it("SQLインジェクション風の文字列は、ただの文字列として扱う", async () => {
    const { call, openSession } = createTestApp();
    const { sessionId } = await openSession();
    const text = `'; DROP TABLE opinions; --`;
    const posted = await call("POST", `/sessions/${sessionId}/opinions`, {
      body: { body: text, kind: "idea", submissionId: newSubmissionId() },
    });
    expect(posted.json.opinion.body).toBe(text);
  });

  it("想定外のエラーでは、詳細や投稿本文を返さない", async () => {
    const repos = createTestRepositories();
    repos.opinions.createIfAbsent = async () => {
      throw new Error("機密の本文: 秘密の意見");
    };
    const { call, openSession } = createTestApp({ repos });
    const { sessionId } = await openSession();
    const res = await call("POST", `/sessions/${sessionId}/opinions`, {
      body: { body: "秘密の意見", kind: "idea", submissionId: newSubmissionId() },
    });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("秘密の意見");
    expect(res.json.error.code).toBe("internal_error");
  });
});

describe("HTTPの扱い", () => {
  it("ヘルスチェック", async () => {
    const { call } = createTestApp();
    expect((await call("GET", "/health")).json).toEqual({ status: "ok" });
  });

  it("JSONとして読めない本文は400", async () => {
    const { call, openSession } = createTestApp();
    const { sessionId } = await openSession();
    const res = await call("POST", `/sessions/${sessionId}/opinions`, { rawBody: "{not json" });
    expect(res.statusCode).toBe(400);
    expect(res.json.error.code).toBe("invalid_json");
  });

  it("本文が大きすぎると413", async () => {
    const { call, openSession } = createTestApp();
    const { sessionId } = await openSession();
    const res = await call("POST", `/sessions/${sessionId}/opinions`, {
      rawBody: JSON.stringify({ body: "あ".repeat(MAX_BODY_BYTES) }),
    });
    expect(res.statusCode).toBe(413);
  });

  it("存在しないパスは404、使えないメソッドは405", async () => {
    const { call } = createTestApp();
    expect((await call("GET", "/nothing")).statusCode).toBe(404);
    expect((await call("DELETE", "/health")).statusCode).toBe(405);
  });

  it("末尾のスラッシュを許す", async () => {
    const { call } = createTestApp();
    expect((await call("GET", "/health/")).statusCode).toBe(200);
  });

  it("CORS: 許可するオリジンを指定したときだけヘッダーを付ける", async () => {
    const without = createTestApp();
    expect((await without.call("GET", "/health")).headers["access-control-allow-origin"]).toBeUndefined();
    const withOrigin = createTestApp({ allowedOrigin: "https://example.test" });
    const res = await withOrigin.call("OPTIONS", "/sessions/x/opinions");
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("https://example.test");
    expect(res.headers["access-control-allow-headers"]).toContain("authorization");
  });
});
