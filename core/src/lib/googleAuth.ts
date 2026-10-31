import { AppError } from "./errors.js";
import { base64urlDecode } from "./jwt.js";

/**
 * Google の ID トークン(RS256 の JWT)を検証する。ログイン時の1回だけ使う。
 * 署名は Google の公開鍵(JWKS)で確かめ、発行者・対象(クライアントID)・期限・メールの確認済みを調べる。
 * 依存を増やさないよう、WebCrypto だけで実装している。
 */
const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const KEYS_CACHE_SECONDS = 60 * 60;

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
}

const invalid = (message = "Googleのトークンが正しくありません") => new AppError(401, "invalid_google_token", message);

export interface GoogleVerifierOptions {
  clientId: string;
  fetch?: typeof fetch;
  now?: () => Date;
}

export function createGoogleVerifier(options: GoogleVerifierOptions) {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const now = options.now ?? (() => new Date());
  let cache: { keys: Jwk[]; fetchedAt: number } | undefined;

  async function loadKeys(force: boolean): Promise<Jwk[]> {
    const nowMs = now().getTime();
    if (!force && cache && nowMs - cache.fetchedAt < KEYS_CACHE_SECONDS * 1000) return cache.keys;
    const response = await fetchImpl(GOOGLE_CERTS_URL);
    if (!response.ok) throw new AppError(502, "google_unreachable", "Googleの公開鍵を取得できませんでした");
    const body = (await response.json()) as { keys?: Jwk[] };
    cache = { keys: body.keys ?? [], fetchedAt: nowMs };
    return cache.keys;
  }

  async function findKey(kid: string): Promise<Jwk | undefined> {
    const keys = await loadKeys(false);
    // 鍵が入れ替わった直後は、キャッシュに無い。一度だけ取り直す
    return keys.find((k) => k.kid === kid) ?? (await loadKeys(true)).find((k) => k.kid === kid);
  }

  return async function verify(idToken: string): Promise<GoogleIdentity> {
    const parts = idToken.split(".");
    if (parts.length !== 3) throw invalid();
    const [head, body, signature] = parts as [string, string, string];
    let header: { alg?: string; kid?: string };
    let claims: Record<string, unknown>;
    try {
      header = JSON.parse(new TextDecoder().decode(base64urlDecode(head)));
      claims = JSON.parse(new TextDecoder().decode(base64urlDecode(body)));
    } catch {
      throw invalid();
    }
    if (header.alg !== "RS256" || typeof header.kid !== "string") throw invalid();

    const jwk = await findKey(header.kid);
    if (!jwk) throw invalid();
    const key = await globalThis.crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await globalThis.crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64urlDecode(signature),
      new TextEncoder().encode(`${head}.${body}`),
    );
    if (!ok) throw invalid();

    if (typeof claims["iss"] !== "string" || !ISSUERS.has(claims["iss"])) throw invalid();
    // 他のサービス向けに発行されたトークンを弾く
    if (claims["aud"] !== options.clientId) throw invalid();
    if (typeof claims["exp"] !== "number" || claims["exp"] * 1000 <= now().getTime()) throw invalid("Googleのトークンの期限が切れています");
    if (typeof claims["sub"] !== "string" || typeof claims["email"] !== "string") throw invalid();
    if (claims["email_verified"] !== true) throw invalid("Googleのメールアドレスが確認されていません");
    return { sub: claims["sub"], email: claims["email"] };
  };
}
