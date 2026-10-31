/** 日本時間の日付(YYYY-MM-DD)。1日の上限の区切りに使う */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function jstDayKey(now: Date): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 次の日本時間の0時(上限が戻る時刻)をISOで返す */
export function nextJstMidnightIso(now: Date): string {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const nextJstMidnightAsUtc = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() + 1);
  return new Date(nextJstMidnightAsUtc - JST_OFFSET_MS).toISOString();
}
