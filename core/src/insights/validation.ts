import { AnalysisOutputError } from "../analysis/validation.js";
import type { InsightContent } from "./types.js";

export const INSIGHT_FIELDS = ["commonPoints", "differences", "premiseDifferences", "questions"] as const;
const MAX_ITEMS = 5;
const MAX_LENGTH = 300;

/** 制御文字（改行とタブを除く）を含むか */
// 制御文字を探すことが目的の正規表現なので、no-control-regex は意図して許可する
// oxlint-disable-next-line no-control-regex
const hasControl = (s: string) => /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s);

/**
 * LLMの出力や、編集の入力を検証する。形が違えば、拒否する（そのまま画面に出さない）。
 * 空の項目は取り除く。項目が1つもなければ、拒否する。
 */
export function validateInsightContent(raw: unknown): InsightContent {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new AnalysisOutputError("出力がオブジェクトではありません");
  }
  const source = raw as Record<string, unknown>;
  const out = {} as InsightContent;
  let total = 0;
  for (const field of INSIGHT_FIELDS) {
    const value = source[field];
    if (!Array.isArray(value)) throw new AnalysisOutputError(`${field} が配列ではありません`);
    const items: string[] = [];
    for (const item of value) {
      if (typeof item !== "string") throw new AnalysisOutputError(`${field} に文字列でない項目があります`);
      const text = item.trim();
      if (text === "") continue;
      if ([...text].length > MAX_LENGTH) throw new AnalysisOutputError(`${field} の項目が長すぎます`);
      if (hasControl(text)) throw new AnalysisOutputError(`${field} に使えない文字があります`);
      items.push(text);
    }
    if (items.length > MAX_ITEMS) throw new AnalysisOutputError(`${field} の項目が多すぎます`);
    total += items.length;
    out[field] = items;
  }
  if (total === 0) throw new AnalysisOutputError("出力に項目がありません");
  return out;
}
