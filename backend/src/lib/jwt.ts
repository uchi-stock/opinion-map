import { safeEqual } from "./safeEqual.js";

/**
 * セッショントークン(HS256 の JWT)。Node.js固有の機能に頼らないので、ブラウザでも動く。
 * 署名と期限の検証だけを行う。中身(sub・email など)の意味づけは、呼び出し側が行う。
 */
const encoder = new TextEncoder();

export function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlDecode(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

const encodeJson = (value: unknown) => base64urlEncode(encoder.encode(JSON.stringify(value)));

async function hmac(secret: string, data: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return base64urlEncode(new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(data))));
}

export interface SessionClaims {
  /** 利用者を特定する値(Googleのアカウントの識別子) */
  sub: string;
  email: string;
  /** 発行時刻(エポック秒) */
  iat: number;
  /** 期限(エポック秒) */
  exp: number;
}

export async function signSession(claims: SessionClaims, secret: string): Promise<string> {
  const head = encodeJson({ alg: "HS256", typ: "JWT" });
  const body = encodeJson(claims);
  return `${head}.${body}.${await hmac(secret, `${head}.${body}`)}`;
}

/** 署名が正しく、期限内なら中身を返す。それ以外は null */
export async function verifySession(token: string, secret: string, nowSeconds: number): Promise<SessionClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, signature] = parts as [string, string, string];
  try {
    const header = JSON.parse(new TextDecoder().decode(base64urlDecode(head))) as { alg?: string };
    // アルゴリズムは固定する(alg を none や別の方式に変えた偽造を防ぐ)
    if (header.alg !== "HS256") return null;
    if (!safeEqual(signature, await hmac(secret, `${head}.${body}`))) return null;
    const claims = JSON.parse(new TextDecoder().decode(base64urlDecode(body))) as Partial<SessionClaims>;
    if (typeof claims.sub !== "string" || typeof claims.email !== "string") return null;
    if (typeof claims.exp !== "number" || typeof claims.iat !== "number" || claims.exp <= nowSeconds) return null;
    return claims as SessionClaims;
  } catch {
    return null;
  }
}
