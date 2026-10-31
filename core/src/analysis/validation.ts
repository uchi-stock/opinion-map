import { sha256Hex } from "../lib/hash.js";
import { AppError } from "../lib/errors.js";
import type { AnalysisCluster, AnalysisResult, RawAnalysisResult } from "./types.js";

/** 分析基盤の出力が正しくないとき。画面には出さず、実行を失敗として記録する */
export class AnalysisOutputError extends AppError {
  constructor(message: string) {
    super(502, "invalid_output", message);
    this.name = "AnalysisOutputError";
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * 分析基盤の出力を検証する。
 * - 形が正しいこと
 * - クラスタのIDが重複しないこと
 * - 投稿のIDが、入力にあったものだけであること（存在しないIDは、誤りとして拒否する）
 * そのうえで、どのクラスタにも現れない投稿を、「未分類」として必ず求める。
 */
export function validateResult(raw: unknown, inputOpinionIds: readonly string[]): AnalysisResult {
  if (!isRecord(raw)) throw new AnalysisOutputError("結果がオブジェクトではありません");
  if (typeof raw["overview"] !== "string") throw new AnalysisOutputError("overview が文字列ではありません");
  if (!Array.isArray(raw["clusters"])) throw new AnalysisOutputError("clusters が配列ではありません");

  const known = new Set(inputOpinionIds);
  const seenClusterIds = new Set<string>();
  const classified = new Set<string>();
  const clusters: AnalysisCluster[] = [];

  for (const [index, item] of raw["clusters"].entries()) {
    const where = `clusters[${index}]`;
    if (!isRecord(item)) throw new AnalysisOutputError(`${where} がオブジェクトではありません`);
    const { id, level, parentId, title, summary, opinionIds } = item;
    if (typeof id !== "string" || id.length === 0) throw new AnalysisOutputError(`${where}.id が正しくありません`);
    if (seenClusterIds.has(id)) throw new AnalysisOutputError(`${where}.id が重複しています`);
    if (typeof level !== "number" || !Number.isInteger(level) || level < 1) {
      throw new AnalysisOutputError(`${where}.level が正しくありません`);
    }
    if (parentId !== null && typeof parentId !== "string") throw new AnalysisOutputError(`${where}.parentId が正しくありません`);
    if (typeof title !== "string" || typeof summary !== "string") {
      throw new AnalysisOutputError(`${where} の title または summary が文字列ではありません`);
    }
    if (!Array.isArray(opinionIds) || opinionIds.some((o) => typeof o !== "string")) {
      throw new AnalysisOutputError(`${where}.opinionIds が文字列の配列ではありません`);
    }
    const unique = [...new Set(opinionIds as string[])];
    for (const opinionId of unique) {
      if (!known.has(opinionId)) throw new AnalysisOutputError(`${where} に、入力にない投稿のIDが含まれています`);
      classified.add(opinionId);
    }
    seenClusterIds.add(id);
    clusters.push({ id, level, parentId: parentId as string | null, title, summary, opinionIds: unique });
  }

  const clusterIds = new Set(clusters.map((c) => c.id));
  for (const c of clusters) {
    if (c.parentId !== null && !clusterIds.has(c.parentId)) {
      throw new AnalysisOutputError(`クラスタ ${c.id} の親が見つかりません`);
    }
  }

  const unclassifiedOpinionIds = inputOpinionIds.filter((id) => !classified.has(id));
  const result: RawAnalysisResult = { overview: raw["overview"], clusters };
  return { ...result, unclassifiedOpinionIds };
}

/** 入力の投稿から、内容を表すハッシュを作る。順番に依存しない */
export async function hashInput(opinions: ReadonlyArray<{ id: string; body: string; kind: string }>): Promise<string> {
  const normalized = [...opinions]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((o) => [o.id, o.kind, o.body]);
  return sha256Hex(JSON.stringify(normalized));
}
