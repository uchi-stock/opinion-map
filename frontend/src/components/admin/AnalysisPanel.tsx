import { useCallback, useEffect, useState } from "react";
import type { AdminApi } from "../../api/admin.ts";
import type { AnalysisCluster, AnalysisRun, PublicOpinion } from "../../api/types.ts";
import { KIND_LABELS } from "../../lib/text.ts";

const POLL_MS = 3000;

const STATUS_LABELS: Record<AnalysisRun["status"], string> = {
  queued: "待機中",
  running: "分析中",
  succeeded: "完了",
  failed: "失敗",
};

export const opinionAnchor = (id: string) => `opinion-${id}`;

function OpinionLine({ opinion }: { opinion: PublicOpinion | undefined }) {
  if (!opinion) return <li className="text-body-secondary">（削除された投稿）</li>;
  return (
    <li className="mb-1">
      <span className="badge text-bg-secondary me-1">{KIND_LABELS[opinion.kind]}</span>
      <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{opinion.body}</span>{" "}
      <a href={`#${opinionAnchor(opinion.id)}`} className="small">
        元の投稿
      </a>
    </li>
  );
}

function Group({
  title,
  summary,
  ids,
  byId,
  tone,
}: {
  title: string;
  summary?: string;
  ids: string[];
  byId: Map<string, PublicOpinion>;
  tone?: "warning";
}) {
  return (
    <section className={`card mb-2${tone ? ` border-${tone}` : ""}`} aria-label={title}>
      <div className="card-body py-2">
        <h4 className="h6">
          {title}（{ids.length}件）
        </h4>
        {summary && <p className="small text-body-secondary mb-2">{summary}</p>}
        <ul className="list-unstyled mb-0">
          {ids.map((id) => (
            <OpinionLine key={id} opinion={byId.get(id)} />
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * 分析の結果を表示する。
 * どのクラスタにも入らなかった投稿は、「未分類」として、クラスタと同じ大きさで必ず出す。
 */
export function AnalysisResultView({ run, opinions }: { run: AnalysisRun; opinions: PublicOpinion[] }) {
  const result = run.result;
  if (!result) return null;
  const byId = new Map(opinions.map((o) => [o.id, o]));
  const top = result.clusters.filter((c) => c.parentId === null);
  const childrenOf = (c: AnalysisCluster) => result.clusters.filter((x) => x.parentId === c.id);

  return (
    <div>
      {result.overview && <p>{result.overview}</p>}
      {top.map((c) => (
        <div key={c.id}>
          <Group title={c.title || "（名前なし）"} summary={c.summary} ids={c.opinionIds} byId={byId} />
          {childrenOf(c).map((child) => (
            <div key={child.id} className="ms-3">
              <Group title={child.title || "（名前なし）"} summary={child.summary} ids={child.opinionIds} byId={byId} />
            </div>
          ))}
        </div>
      ))}
      {result.unclassifiedOpinionIds.length > 0 && (
        <Group title="未分類" summary="AIがどのまとまりにも入れなかった意見です。" ids={result.unclassifiedOpinionIds} byId={byId} tone="warning" />
      )}
    </div>
  );
}

export function AnalysisPanel({
  api,
  sessionId,
  opinions,
  describeError,
}: {
  api: AdminApi;
  sessionId: string;
  opinions: PublicOpinion[];
  describeError: (e: unknown) => string;
}) {
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = useCallback((e: unknown) => setError(describeError(e)), [describeError]);

  // 最新の実行を取り直す（結果も含める）
  const refresh = useCallback(async () => {
    const runs = await api.listAnalyses(sessionId);
    const latest = runs[runs.length - 1];
    setRun(latest ? await api.getAnalysis(latest.id) : null);
  }, [api, sessionId]);

  useEffect(() => {
    refresh().catch(fail);
  }, [refresh, fail]);

  const active = run?.status === "queued" || run?.status === "running";
  useEffect(() => {
    if (!active || !run) return;
    const timer = window.setInterval(() => {
      api.getAnalysis(run.id).then(setRun, fail);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, run, api, fail]);

  async function act(f: () => Promise<AnalysisRun>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setRun(await f());
      await refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="AIによる分析">
      <h2 className="h6">AIによる分析</h2>
      <p className="small text-body-secondary">
        AIの結果は仮説です。元の投稿を確認しながら使ってください。
      </p>
      <button
        type="button"
        className="btn btn-outline-primary w-100 mb-3"
        disabled={busy || active || opinions.length === 0}
        onClick={() => void act(() => api.startAnalysis(sessionId))}
      >
        {run ? "もう一度分析する" : "分析する"}
      </button>
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      {run && (
        <div aria-live="polite">
          <p className="small mb-2">
            状態: <strong>{STATUS_LABELS[run.status]}</strong>（対象{run.inputCount}件
            {run.newOpinionCount > 0 && `、この後に${run.newOpinionCount}件が増えています`}）
          </p>
          {run.status === "failed" && (
            <div className="alert alert-danger" role="alert">
              分析に失敗しました。{run.error?.summary}
              <button type="button" className="btn btn-sm btn-outline-danger d-block mt-2" disabled={busy} onClick={() => void act(() => api.retryAnalysis(run.id))}>
                再実行する
              </button>
            </div>
          )}
          {run.status === "succeeded" && <AnalysisResultView run={run} opinions={opinions} />}
        </div>
      )}
    </section>
  );
}
