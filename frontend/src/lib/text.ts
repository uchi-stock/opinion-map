/** 文字数。サロゲートペア（絵文字など）を1文字として数える。バックエンドと同じ数え方 */
export function charLength(text: string): number {
  return Array.from(text).length;
}

export const KIND_LABELS = {
  experience: "経験",
  question: "疑問",
  idea: "アイデア",
} as const;
