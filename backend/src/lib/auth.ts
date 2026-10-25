import { sha256Hex } from "./hash.js";
import type { OperatorTokenRepository } from "../repositories/types.js";

/**
 * 文字列を、一致するまでの時間が内容に左右されにくい方法で比較する。
 * Node.js固有の機能に頼らないので、ブラウザでも動く（デモ版で使う）。
 * 長さが違う場合も、短いほうを0で埋めて、最後まで比較する。
 */
export function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  const length = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < length; i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

/**
 * 運営者の認証。環境変数の ADMIN_TOKEN と、Bearer トークンを比較する。
 * トークンが未設定のときは、常に拒否する（安全側に倒す）。
 * 最終的な認証方式は別のIssueで決める。ここは最小の保護である。
 */
export function createAdminAuthenticator(adminToken: string | undefined) {
  const configured = adminToken && adminToken.length > 0 ? adminToken : undefined;
  return (headers: Record<string, string | undefined>): boolean => {
    if (configured === undefined) return false;
    const header = headers["authorization"];
    if (!header || !header.startsWith("Bearer ")) return false;
    return safeEqual(header.slice("Bearer ".length), configured);
  };
}

/** 認証された運営者。オーナーはすべてを操作でき、運営者は、割り当てられたイベントだけを操作できる */
export type Principal = { kind: "owner" } | { kind: "operator"; eventId: string; tokenId: string };

export const OPERATOR_TOKEN_PREFIX = "opm_";

/**
 * リクエストの Bearer トークンから、運営者を特定する。
 * - 環境変数のオーナーのトークンと一致すれば、オーナー
 * - それ以外は、ハッシュを引いて、失効していない運営者トークンを探す
 * 運営者トークンは、推測できない乱数であり、イベントのIDなどを認証の代わりにしない。
 */
export function createAuthenticator(
  ownerToken: string | undefined,
  tokens: Pick<OperatorTokenRepository, "getByHash">,
) {
  const owner = ownerToken && ownerToken.length > 0 ? ownerToken : undefined;
  return async (headers: Record<string, string | undefined>): Promise<Principal | null> => {
    const header = headers["authorization"];
    if (!header || !header.startsWith("Bearer ")) return null;
    const presented = header.slice("Bearer ".length);
    if (owner !== undefined && safeEqual(presented, owner)) return { kind: "owner" };
    if (!presented.startsWith(OPERATOR_TOKEN_PREFIX)) return null;
    const record = await tokens.getByHash(await sha256Hex(presented));
    if (!record || record.revokedAt) return null;
    return { kind: "operator", eventId: record.eventId, tokenId: record.id };
  };
}
