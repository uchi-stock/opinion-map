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
