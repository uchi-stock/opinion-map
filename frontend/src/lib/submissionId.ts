/**
 * 二重送信を防ぐための、投稿ごとの使い捨てのID。利用者を識別しない。
 * バックエンドの形式（英数字・ハイフン・アンダースコアの16〜64文字）を満たす。
 * 古いブラウザなどで crypto.randomUUID が無い場合は、代わりの方法で作る。
 */
export function newSubmissionId(): string {
  const c: Crypto | undefined = typeof crypto === "undefined" ? undefined : crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
