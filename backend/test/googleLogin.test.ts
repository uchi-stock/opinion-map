import { describe, expect, it } from "vitest";
import { createGoogleVerifier } from "../../core/src/lib/googleAuth.js";
import { base64urlEncode, signSession, verifySession } from "../../core/src/lib/jwt.js";
import { createTestApp } from "./helpers.js";

const CLIENT_ID = "test-client.apps.googleusercontent.com";
const SECRET = "s".repeat(40);
const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const nowSec = Math.floor(NOW / 1000);

const enc = (v: unknown) => base64urlEncode(new TextEncoder().encode(JSON.stringify(v)));

async function makeGoogle() {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  let fetched = 0;
  const fetchStub = (async () => {
    fetched++;
    return Response.json({ keys: [{ kid: "k1", kty: "RSA", n: jwk.n, e: jwk.e }] });
  }) as unknown as typeof fetch;

  async function idToken(claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}, privateKey = pair.privateKey) {
    const h = enc({ alg: "RS256", kid: "k1", typ: "JWT", ...header });
    const b = enc({
      iss: "https://accounts.google.com",
      aud: CLIENT_ID,
      sub: "g-123",
      email: "owner@example.com",
      email_verified: true,
      exp: nowSec + 3600,
      ...claims,
    });
    const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${b}`)));
    return `${h}.${b}.${base64urlEncode(sig)}`;
  }
  return { idToken, fetchStub, fetchedCount: () => fetched, pair };
}

describe("セッショントークン(JWT)", () => {
  const claims = { sub: "u", email: "a@example.com", iat: nowSec, exp: nowSec + 60 };

  it("署名して、検証できる", async () => {
    const token = await signSession(claims, SECRET);
    expect(await verifySession(token, SECRET, nowSec)).toEqual(claims);
  });

  it("鍵が違う・改ざん・期限切れ・形式の違うものは null", async () => {
    const token = await signSession(claims, SECRET);
    expect(await verifySession(token, "x".repeat(40), nowSec)).toBeNull();
    expect(await verifySession(token, SECRET, nowSec + 61)).toBeNull();
    const [h, , s] = token.split(".");
    const forged = `${h}.${enc({ ...claims, email: "evil@example.com" })}.${s}`;
    expect(await verifySession(forged, SECRET, nowSec)).toBeNull();
    expect(await verifySession("a.b", SECRET, nowSec)).toBeNull();
    expect(await verifySession("a.b.c", SECRET, nowSec)).toBeNull();
  });

  it("alg を none などに変えた偽造は、受け付けない", async () => {
    const body = enc(claims);
    expect(await verifySession(`${enc({ alg: "none", typ: "JWT" })}.${body}.`, SECRET, nowSec)).toBeNull();
    expect(await verifySession(`${enc({ alg: "HS512", typ: "JWT" })}.${body}.x`, SECRET, nowSec)).toBeNull();
  });
});

describe("Googleの ID トークンの検証", () => {
  const verifier = async () => {
    const g = await makeGoogle();
    return { g, verify: createGoogleVerifier({ clientId: CLIENT_ID, fetch: g.fetchStub, now: () => new Date(NOW) }) };
  };

  it("正しいトークンから、メールアドレスを取り出す", async () => {
    const { g, verify } = await verifier();
    expect(await verify(await g.idToken())).toEqual({ sub: "g-123", email: "owner@example.com" });
  });

  it("公開鍵は、キャッシュして使い回す", async () => {
    const { g, verify } = await verifier();
    await verify(await g.idToken());
    await verify(await g.idToken());
    expect(g.fetchedCount()).toBe(1);
  });

  it("対象(aud)・発行者・期限・メール確認・署名・鍵のIDが違えば、拒否する", async () => {
    const { g, verify } = await verifier();
    const other = (await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const bad = [
      await g.idToken({ aud: "other-client" }),
      await g.idToken({ iss: "https://evil.example.com" }),
      await g.idToken({ exp: nowSec - 1 }),
      await g.idToken({ email_verified: false }),
      await g.idToken({ email: undefined }),
      await g.idToken({}, {}, other.privateKey),
      await g.idToken({}, { kid: "unknown" }),
      await g.idToken({}, { alg: "HS256" }),
      "not-a-jwt",
    ];
    for (const token of bad) {
      await expect(verify(token)).rejects.toMatchObject({ status: 401 });
    }
  });
});

describe("オーナーのGoogleログイン(API)", () => {
  async function setup(ownerEmails = ["Owner@Example.com"]) {
    const g = await makeGoogle();
    let now = NOW;
    const t = createTestApp({
      now: () => new Date(now),
      ownerLogin: { googleClientId: CLIENT_ID, sessionSecret: SECRET, ownerEmails, fetch: g.fetchStub },
    });
    const login = async (token: string) => t.call("POST", "/auth/session", { headers: { authorization: `Bearer ${token}` } });
    return { ...t, g, login, advance: (ms: number) => (now += ms) };
  }

  it("許可したメールアドレスなら、セッショントークンを受け取り、オーナーとして使える", async () => {
    const { g, login, call } = await setup();
    const res = await login(await g.idToken());
    expect(res.statusCode).toBe(200);
    expect(res.json.email).toBe("owner@example.com");
    const session = { headers: { authorization: `Bearer ${res.json.token}` } };
    expect((await call("GET", "/me", session)).json).toEqual({ role: "owner", email: "owner@example.com" });
    // オーナー専用の操作ができる
    expect((await call("POST", "/events", { ...session, body: { name: "新しいイベント" } })).statusCode).toBe(201);
  });

  it("許可していないメールアドレスは403で、トークンを渡さない", async () => {
    const { g, login } = await setup();
    const res = await login(await g.idToken({ email: "stranger@example.com" }));
    expect(res.statusCode).toBe(403);
    expect(res.json.error.code).toBe("not_owner");
    expect(res.body).not.toContain("token");
  });

  it("管理者から外された人は、期限内のセッションでも次のリクエストから使えず、再ログインもできない", async () => {
    const { g, login, call } = await setup();
    const session = { headers: { authorization: `Bearer ${(await login(await g.idToken())).json.token}` } };
    await call("POST", "/admins", { ...session, body: { email: "second@example.com" } });
    expect((await call("DELETE", "/admins/owner%40example.com", session)).statusCode).toBe(200);
    expect((await call("GET", "/me", session)).statusCode).toBe(401);
    expect((await login(await g.idToken())).statusCode).toBe(403);
  });

  it("Googleのトークンがない・不正なら401", async () => {
    const { login, call } = await setup();
    expect((await call("POST", "/auth/session")).statusCode).toBe(401);
    expect((await login("garbage")).statusCode).toBe(401);
  });

  it("期限が切れたセッションは使えない", async () => {
    const { g, login, call, advance } = await setup();
    const res = await login(await g.idToken());
    advance(8 * 24 * 60 * 60 * 1000);
    expect((await call("GET", "/me", { headers: { authorization: `Bearer ${res.json.token}` } })).statusCode).toBe(401);
  });

  it("オーナーの一覧から外されたメールアドレスのセッションは、期限内でも使えない", async () => {
    const g = await makeGoogle();
    const a = createTestApp({ ownerLogin: { googleClientId: CLIENT_ID, sessionSecret: SECRET, ownerEmails: ["owner@example.com"], fetch: g.fetchStub }, now: () => new Date(NOW) });
    const token = (await a.call("POST", "/auth/session", { headers: { authorization: `Bearer ${await g.idToken()}` } })).json.token;
    const b = createTestApp({ ownerLogin: { googleClientId: CLIENT_ID, sessionSecret: SECRET, ownerEmails: ["someone-else@example.com"], fetch: g.fetchStub }, now: () => new Date(NOW) });
    expect((await b.call("GET", "/me", { headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
  });

  it("別の署名鍵で作ったセッションは使えない", async () => {
    const { call } = await setup();
    const forged = await signSession({ sub: "x", email: "owner@example.com", iat: nowSec, exp: nowSec + 60 }, "z".repeat(40));
    expect((await call("GET", "/me", { headers: { authorization: `Bearer ${forged}` } })).statusCode).toBe(401);
  });

  it("未設定のときは503。署名鍵が短いと、起動時に拒否する", async () => {
    const t = createTestApp();
    expect((await t.call("POST", "/auth/session", { headers: { authorization: "Bearer x" } })).statusCode).toBe(503);
    expect(() => createTestApp({ ownerLogin: { googleClientId: CLIENT_ID, sessionSecret: "short", ownerEmails: ["a@example.com"] } })).toThrow();
  });
});

describe("イベントの作成者とアイコン", () => {
  const PICTURE = "https://lh3.googleusercontent.com/a/abc123";

  async function setup() {
    const g = await makeGoogle();
    const t = createTestApp({
      now: () => new Date(NOW),
      ownerLogin: { googleClientId: CLIENT_ID, sessionSecret: SECRET, ownerEmails: ["owner@example.com"], fetch: g.fetchStub },
    });
    const login = async (claims: Record<string, unknown> = {}) => {
      const res = await t.call("POST", "/auth/session", { headers: { authorization: `Bearer ${await g.idToken(claims)}` } });
      return { headers: { authorization: `Bearer ${res.json.token as string}` } };
    };
    return { ...t, login };
  }

  it("ログインしたときの Google のプロフィール画像を覚え、ログイン中のアカウントとして返す", async () => {
    const { call, login } = await setup();
    const session = await login({ picture: PICTURE });
    expect((await call("GET", "/me", session)).json).toEqual({ role: "owner", email: "owner@example.com", picture: PICTURE });
  });

  it("Google の配信元でない画像のURLは、覚えない", async () => {
    const { call, login } = await setup();
    for (const picture of ["https://evil.example.com/a.png", "http://lh3.googleusercontent.com/a", "javascript:alert(1)", "https://lh3.googleusercontent.com.evil.com/a", 42]) {
      const session = await login({ picture });
      expect((await call("GET", "/me", session)).json).toEqual({ role: "owner", email: "owner@example.com" });
    }
  });

  it("画像が変わったら更新し、画像が無くなったら消す", async () => {
    const { call, login } = await setup();
    const next = "https://lh3.googleusercontent.com/a/new";
    await login({ picture: PICTURE });
    const session = await login({ picture: next });
    expect((await call("GET", "/me", session)).json.picture).toBe(next);
    const without = await login();
    expect((await call("GET", "/me", without)).json.picture).toBeUndefined();
  });

  it("作ったイベントに、作成者のメールを記録し、一覧に、作成者の画像を添える", async () => {
    const { call, login } = await setup();
    const session = await login({ picture: PICTURE });
    const created = (await call("POST", "/events", { ...session, body: { name: "新しいイベント" } })).json;
    expect(created.createdBy).toBe("owner@example.com");
    const list = (await call("GET", "/events", session)).json.events as { id: string; createdBy?: string; creatorPicture?: string }[];
    expect(list.find((e) => e.id === created.id)).toMatchObject({ createdBy: "owner@example.com", creatorPicture: PICTURE });
  });

  it("合言葉(トークン)で作ったイベントは、(token) と記録する。画像は添えない", async () => {
    const { call } = await setup();
    const created = (await call("POST", "/events", { admin: true, body: { name: "合言葉で作った" } })).json;
    expect(created.createdBy).toBe("(token)");
    const list = (await call("GET", "/events", { admin: true })).json.events as { id: string; creatorPicture?: string }[];
    expect(list.find((e) => e.id === created.id)?.creatorPicture).toBeUndefined();
  });
});
