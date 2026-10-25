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
