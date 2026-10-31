import type { InsightContent, PublicOpinion } from "../api/types.ts";
import { KIND_LABELS } from "../lib/text.ts";

/** 要約のビューに出す形。参加者向けの応答と、運営者向けの分析の結果の、どちらからも作れる */
export interface SummaryData {
  overview: string;
  clusters: { id: string; level: number; title: string; summary: string; opinionCount: number; opinionIds?: string[] }[];
  unclassifiedCount: number;
  unclassifiedOpinionIds?: string[];
  insights: { clusterId: string; content: InsightContent; approved: boolean }[];
  /** 分析のあとに増えた投稿の数 */
  newOpinionCount: number;
}

function Originals({ ids, opinions, label }: { ids: string[] | undefined; opinions: Map<string, PublicOpinion>; label: string }) {
  const found = (ids ?? []).flatMap((id) => {
    const o = opinions.get(id);
    return o ? [o] : [];
  });
  if (found.length === 0) return null;
  return (
    <details className="mt-1">
      <summary className="small">{label}（{found.length}件）</summary>
      <ul className="small mb-0 mt-1">
        {found.map((o) => (
          <li key={o.id} style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
            <span className="badge text-bg-secondary me-1">{KIND_LABELS[o.kind]}</span>
            {o.body}
          </li>
        ))}
      </ul>
    </details>
  );
}

const INSIGHT_LABELS: [keyof InsightContent, string][] = [
  ["commonPoints", "共通している点"],
  ["differences", "意見の違い"],
  ["premiseDifferences", "前提の違い"],
  ["questions", "議論の問いの案"],
];

/**
 * 要約のビュー。AIによる要約であることを、注記で示す。
 * 原文は、各まとまりの「元の意見を見る」から、たどれる。要約は原文を置き換えない。
 */
export function SummaryView({
  data,
  opinions,
  audience,
}: {
  data: SummaryData;
  /** 元の意見。参加者に見せない設定のときは、空 */
  opinions: PublicOpinion[];
  audience: "participant" | "admin";
}) {
  const byId = new Map(opinions.map((o) => [o.id, o]));
  const topLevel = Math.min(...data.clusters.map((c) => c.level));
  return (
    <div data-testid="summary-view">
      <div className="alert alert-info small" role="note">
        {audience === "participant"
          ? "AIによる要約です。運営者が確認して、公開した内容です。要約は参考情報で、原文を置き換えません。"
          : "AIによる要約です。参加者に公開する前に、内容を確認してください。要約は参考情報で、原文を置き換えません。"}
      </div>
      {data.newOpinionCount > 0 && (
        <p className="small text-warning-emphasis">この要約のあとに、{data.newOpinionCount}件の意見が増えています。要約には含まれていません。</p>
      )}
      {data.overview && (
        <section aria-label="全体の概要" className="mb-3">
          <h3 className="h6">全体の概要</h3>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{data.overview}</p>
        </section>
      )}
      {data.clusters
        .filter((c) => c.level === topLevel)
        .map((c) => {
          const insights = data.insights.filter((i) => i.clusterId === c.id);
          return (
            <section key={c.id} aria-label={c.title} className="card mb-2">
              <div className="card-body py-2">
                <h3 className="h6">
                  {c.title}
                  <span className="badge text-bg-secondary ms-2">{c.opinionCount}件</span>
                </h3>
                <p className="mb-1" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{c.summary}</p>
                <Originals ids={c.opinionIds} opinions={byId} label="元の意見を見る" />
                {insights.map((i, n) => (
                  <div key={n} className="mt-2 small border-top pt-2">
                    {audience === "admin" && (
                      <span className={`badge ${i.approved ? "text-bg-success" : "text-bg-secondary"} mb-1`}>
                        {i.approved ? "採用済み（参加者に公開）" : "未採用（参加者には出ません）"}
                      </span>
                    )}
                    {INSIGHT_LABELS.map(([key, label]) =>
                      i.content[key].length === 0 ? null : (
                        <div key={key}>
                          <div className="fw-bold">{label}</div>
                          <ul className="mb-1">
                            {i.content[key].map((text, j) => (
                              <li key={j} style={{ overflowWrap: "anywhere" }}>
                                {text}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ),
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      {data.unclassifiedCount > 0 && (
        <section aria-label="どこにも入らなかった意見" className="card border-warning border-2 mb-2">
          <div className="card-body py-2">
            <h3 className="h6">
              どこにも入らなかった意見
              <span className="badge text-bg-secondary ms-2">{data.unclassifiedCount}件</span>
            </h3>
            <p className="small text-body-secondary mb-1">分類されなかった意見です。少数の意見として、そのまま残しています。</p>
            <Originals ids={data.unclassifiedOpinionIds} opinions={byId} label="元の意見を見る" />
          </div>
        </section>
      )}
    </div>
  );
}
