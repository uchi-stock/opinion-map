import type { AnalysisResult, OpinionKind, PublicOpinion } from "../api/types.ts";
import { KIND_LABELS } from "./text.ts";

/** ボードの1つのまとまり(ホワイトボード上で、付箋を寄せた場所) */
export interface BoardGroup {
  id: string;
  title: string;
  summary?: string;
  opinions: PublicOpinion[];
  /** 分析で、どこにも入らなかった意見。少数意見として目立たせる */
  unclassified?: boolean;
}

const KIND_ORDER: OpinionKind[] = ["experience", "question", "idea"];

/** 種類(経験・疑問・アイデア)ごとにまとめる。分析の結果がないときの並べ方 */
export function groupByKind(opinions: PublicOpinion[]): BoardGroup[] {
  return KIND_ORDER.map((kind) => ({
    id: `kind-${kind}`,
    title: KIND_LABELS[kind],
    opinions: opinions.filter((o) => o.kind === kind),
  })).filter((g) => g.opinions.length > 0);
}

/**
 * 分析のクラスタごとにまとめる。いちばん大きなくくり(最小のレベル)のクラスタを使う。
 * どこにも入らなかった意見は、取りこぼさずに別のまとまりとして置く(少数意見を残す原則)。
 * 分析のあとに増えた投稿は、「新しい投稿」にまとめる。
 */
export function groupByClusters(opinions: PublicOpinion[], result: AnalysisResult): BoardGroup[] {
  const byId = new Map(opinions.map((o) => [o.id, o]));
  const placed = new Set<string>();
  const level = Math.min(...result.clusters.map((c) => c.level));
  const groups: BoardGroup[] = result.clusters
    .filter((c) => c.level === level)
    .map((c) => {
      const members = c.opinionIds.flatMap((id) => {
        const o = byId.get(id);
        if (!o || placed.has(id)) return [];
        placed.add(id);
        return [o];
      });
      return { id: `cluster-${c.id}`, title: c.title, summary: c.summary, opinions: members };
    })
    .filter((g) => g.opinions.length > 0);
  const unclassified = result.unclassifiedOpinionIds.flatMap((id) => {
    const o = byId.get(id);
    if (!o || placed.has(id)) return [];
    placed.add(id);
    return [o];
  });
  if (unclassified.length > 0) {
    groups.push({ id: "unclassified", title: "どこにも入らなかった意見", opinions: unclassified, unclassified: true });
  }
  const added = opinions.filter((o) => !placed.has(o.id));
  if (added.length > 0) groups.push({ id: "new", title: "分析のあとの新しい投稿", opinions: added });
  return groups;
}

/** 付箋の傾き(度)。投稿のIDから決めるので、描き直しても動かない。-2〜2度 */
export function noteTilt(id: string): number {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (hash % 5) - 2;
}
