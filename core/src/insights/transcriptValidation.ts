import { AnalysisOutputError } from "../analysis/validation.js";
import { OPINION_KINDS, type OpinionKind } from "../domain/types.js";

/** 1回で返す候補の数の上限 */
export const MAX_CANDIDATES = 20;

/** 付箋の候補。まだ保存されていない。使う人が確かめて、編集してから投稿する */
export interface OpinionCandidate {
  body: string;
  kind: OpinionKind;
}

// 制御文字を探すことが目的の正規表現なので、no-control-regex は意図して許可する
// oxlint-disable-next-line no-control-regex
const hasControl = (s: string) => /[\u0000-\u001f\u007f]/.test(s);

function toCandidate(item: unknown, maxLength: number): OpinionCandidate | undefined {
  if (typeof item !== "object" || item === null) throw new AnalysisOutputError("候補がオブジェクトではありません");
  const { body, kind } = item as Record<string, unknown>;
  if (typeof body !== "string") throw new AnalysisOutputError("候補の本文が文字列ではありません");
  if (typeof kind !== "string" || !OPINION_KINDS.includes(kind as OpinionKind)) {
    throw new AnalysisOutputError("候補の種類が正しくありません");
  }
  const text = body.trim();
  if (text === "") return undefined;
  if (hasControl(text)) throw new AnalysisOutputError("候補に使えない文字があります");
  // 長すぎる候補は、拒否せず、上限で切る(使う人が確かめて直す)
  return { body: [...text].slice(0, maxLength).join(""), kind: kind as OpinionKind };
}

/**
 * LLMの出力を検証する。形が違えば、拒否する(そのまま画面に出さない)。
 * 空の候補は取り除く。該当なし(0件)は、正しい出力として許す。
 */
export function validateCandidates(raw: unknown, maxLength: number): OpinionCandidate[] {
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { opinions?: unknown }).opinions)) {
    throw new AnalysisOutputError("opinions が配列ではありません");
  }
  const items = (raw as { opinions: unknown[] }).opinions;
  if (items.length > MAX_CANDIDATES * 2) throw new AnalysisOutputError("候補が多すぎます");
  const out: OpinionCandidate[] = [];
  for (const item of items) {
    const candidate = toCandidate(item, maxLength);
    if (candidate) out.push(candidate);
  }
  return out.slice(0, MAX_CANDIDATES);
}
