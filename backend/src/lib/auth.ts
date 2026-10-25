import { createHash, timingSafeEqual } from "node:crypto";

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/**
 * 運営者の認証。環境変数の ADMIN_TOKEN と、Bearer トークンを比較する。
 * トークンが未設定のときは、常に拒否する（安全側に倒す）。
 * 最終的な認証方式は別のIssueで決める。ここは最小の保護である。
 */
export function createAdminAuthenticator(adminToken: string | undefined) {
  const expected = adminToken && adminToken.length > 0 ? sha256(adminToken) : undefined;
  return (headers: Record<string, string | undefined>): boolean => {
    if (!expected) return false;
    const header = headers["authorization"];
    if (!header || !header.startsWith("Bearer ")) return false;
    const actual = sha256(header.slice("Bearer ".length));
    return timingSafeEqual(actual, expected);
  };
}
