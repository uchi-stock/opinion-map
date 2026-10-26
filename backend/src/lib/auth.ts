import { sha256Hex } from "./hash.js";
import { verifySession } from "./jwt.js";
import type { OperatorTokenRepository } from "../repositories/types.js";

import { safeEqual } from "./safeEqual.js";

export { safeEqual };

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
export type Principal = { kind: "owner"; email?: string } | { kind: "operator"; eventId: string; tokenId: string };

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
  options: {
    /** Googleのログインで発行したセッショントークンを、オーナーとして受け付ける */
    session?: { secret: string; ownerEmails: readonly string[]; now?: () => Date };
  } = {},
) {
  const owner = ownerToken && ownerToken.length > 0 ? ownerToken : undefined;
  return async (headers: Record<string, string | undefined>): Promise<Principal | null> => {
    const header = headers["authorization"];
    if (!header || !header.startsWith("Bearer ")) return null;
    const presented = header.slice("Bearer ".length);
    if (owner !== undefined && safeEqual(presented, owner)) return { kind: "owner" };
    if (options.session && presented.split(".").length === 3) {
      const nowSeconds = Math.floor((options.session.now ?? (() => new Date()))().getTime() / 1000);
      const claims = await verifySession(presented, options.session.secret, nowSeconds);
      // 発行後にオーナーの一覧から外されたメールアドレスは、期限内でも受け付けない
      if (claims && options.session.ownerEmails.includes(claims.email.toLowerCase())) {
        return { kind: "owner", email: claims.email };
      }
      return null;
    }
    if (!presented.startsWith(OPERATOR_TOKEN_PREFIX)) return null;
    const record = await tokens.getByHash(await sha256Hex(presented));
    if (!record || record.revokedAt) return null;
    return { kind: "operator", eventId: record.eventId, tokenId: record.id };
  };
}
