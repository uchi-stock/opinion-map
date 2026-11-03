/** 末尾の「/」をすべて取り除く。正規表現を使わず、長い入力でも線形の時間で終わる */
export function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end--;
  return value.slice(0, end);
}
