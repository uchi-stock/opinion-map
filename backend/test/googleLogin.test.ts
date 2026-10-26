import { describe, expect, it } from "vitest";
import { createGoogleVerifier } from "../src/lib/googleAuth.js";
import { base64urlEncode, signSession, verifySession } from "../src/lib/jwt.js";
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

  it("運営者のリンクのトークンも、引き続き使える", async () => {
    const { call, g, login } = await setup();
    const owner = { headers: { authorization: `Bearer ${(await login(await g.idToken())).json.token}` } };
    const event = (await call("POST", "/events", { ...owner, body: { name: "e" } })).json;
    const issued = (await call("POST", `/events/${event.id}/operator-tokens`, { ...owner, body: { label: "x" } })).json;
    const me = await call("GET", "/me", { headers: { authorization: `Bearer ${issued.token}` } });
    expect(me.json).toEqual({ role: "operator", eventId: event.id });
  });
});
