import { verifySession } from "./jwt.js";

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

/** 認証された管理者。環境変数のトークンか、Googleのログインで入る。管理者はすべてを操作できる */
export type Principal = { kind: "owner"; email?: string };

/**
 * リクエストの Bearer トークンから、管理者を特定する。
 * - 環境変数の管理者のトークンと一致すれば、管理者
 * - Googleのログインで発行したセッショントークンで、管理者の一覧にあるメールなら、管理者
 */
export function createAuthenticator(
  ownerToken: string | undefined,
  options: {
    /** Googleのログインで発行したセッショントークンを、オーナーとして受け付ける */
    session?: { secret: string; isOwnerEmail: (email: string) => Promise<boolean>; now?: () => Date };
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
      // 発行後に管理者の一覧から外されたメールアドレスは、期限内でも受け付けない
      if (claims && (await options.session.isOwnerEmail(claims.email))) {
        return { kind: "owner", email: claims.email };
      }
    }
    return null;
  };
}
