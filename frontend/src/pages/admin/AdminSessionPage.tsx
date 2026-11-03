import { useState } from "react";
import type { AdminApi } from "../../api/admin.ts";
import type { AdminOpinion, AnalysisRun, Insight, SessionRecord } from "../../api/types.ts";
import { AdminShell } from "../../components/admin/AdminShell.tsx";
import { AnalysisPanel, opinionAnchor } from "../../components/admin/AnalysisPanel.tsx";
import { SummaryView } from "../../components/SummaryView.tsx";
import { ViewTabs, type ContentView } from "../../components/ViewTabs.tsx";
import { TimerBadge } from "../../components/TimerBadge.tsx";
import { StickyBoard } from "../../components/StickyBoard.tsx";
import { groupByClusters, groupByKind } from "../../lib/board.ts";
import { OpinionCard } from "../../components/OpinionCard.tsx";
import { ModerationControls } from "../../components/admin/ModerationControls.tsx";
import { SESSION_STATUS_LABELS } from "../../lib/labels.ts";
import { withBase } from "../../lib/paths.ts";
import { useHashFlag } from "../../lib/useHashFlag.ts";
import { useLoad } from "../../lib/useLoad.ts";

export function AdminSessionPage({ eventId, sessionId }: { eventId: string; sessionId: string }) {
  return (
    <AdminShell title="テーマ" back={{ href: withBase(`/admin/events/${encodeURIComponent(eventId)}`), label: "イベント" }}>
      {({ api, describeError }) => (
        <SessionContent api={api} describeError={describeError} eventId={eventId} sessionId={sessionId} />
      )}
    </AdminShell>
  );
}

/** 最新の分析と、その案。なければ null(ボードは種類ごとにまとめる。要約のビューは出さない) */
export async function latestAnalysis(api: AdminApi, sessionId: string): Promise<{ run: AnalysisRun; insights: Insight[] } | null> {
  try {
    const runs = await api.listAnalyses(sessionId);
    const latest = runs[runs.length - 1];
    if (!latest || latest.status !== "succeeded") return null;
    const run = await api.getAnalysis(latest.id);
    if (!run.result || run.result.clusters.length === 0) return null;
    const insights = await api.listInsights(run.id).catch(() => [] as Insight[]);
    return { run, insights };
  } catch {
    return null;
  }
}

/** 意見の管理画面(#manage)。一覧で、非表示と削除ができる */
function OpinionManager({
  api,
  opinions,
  describeError,
  reload,
  onBack,
}: {
  api: AdminApi;
  opinions: AdminOpinion[];
  describeError: (e: unknown) => string;
  reload: () => Promise<void>;
  onBack: () => void;
}) {
  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <button type="button" className="btn icon-btn btn-sm btn-outline-secondary" onClick={onBack} aria-label="ボードへ戻る" title="ボードへ戻る">
          ⬅️
        </button>
        <h2 className="h6 mb-0">意見の管理（{opinions.length}件）</h2>
        <button type="button" className="btn icon-btn btn-sm btn-outline-secondary" onClick={() => void reload()} aria-label="更新" title="更新">🔄</button>
      </div>
      {opinions.length === 0 && <p className="text-body-secondary">まだ投稿はありません。</p>}
      {[...opinions].reverse().map((o) => (
        <div key={o.id} id={opinionAnchor(o.id)}>
          <OpinionCard opinion={o} actions={<small className="text-body-secondary">いいね {o.reactionCount ?? 0}</small>} />
          <ModerationControls api={api} opinion={o} describeError={describeError} onChanged={reload} />
        </div>
      ))}
    </>
  );
}

/** 基本の画面。ボード(ホワイトボード)に、投稿を付箋で並べる */
function OpinionBoard({ opinions, analysis, reload }: { opinions: AdminOpinion[]; analysis: AnalysisRun["result"] | null; reload: () => Promise<void> }) {
  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h2 className="h6 mb-0">投稿された意見（{opinions.length}件）</h2>
        <div className="d-flex gap-2">
          <a className="btn icon-btn btn-sm btn-outline-primary" href="#manage" aria-label="意見を管理する" title="意見を管理する">✏️</a>
          <button type="button" className="btn icon-btn btn-sm btn-outline-secondary" onClick={() => void reload()} aria-label="更新" title="更新">🔄</button>
        </div>
      </div>
      {opinions.length === 0 && <p className="text-body-secondary">まだ投稿はありません。</p>}
      {opinions.length > 0 && <StickyBoard groups={analysis ? groupByClusters(opinions, analysis) : groupByKind(opinions)} />}
    </>
  );
}

function SessionContent({
  api,
  describeError,
  eventId,
  sessionId,
}: {
  api: AdminApi;
  describeError: (e: unknown) => string;
  eventId: string;
  sessionId: string;
}) {
  const { state, reload } = useLoad(
    async () => {
      const [events, sessions, opinions, latest] = await Promise.all([
        api.listEvents(),
        api.listSessions(eventId),
        api.listOpinions(sessionId),
        latestAnalysis(api, sessionId),
      ]);
      const event = events.find((e) => e.id === eventId);
      const session = sessions.find((s) => s.id === sessionId);
      if (!event || !session) throw new Error("not_found");
      return { event, session, opinions: opinions.opinions, latest, analysis: latest?.run.result ?? null };
    },
    (e) => (e instanceof Error && e.message === "not_found" ? "テーマが見つかりません。" : describeError(e)),
    [api, eventId, sessionId],
  );

  // ボード(ホワイトボード)が基本。「意見を管理する」のリンク(#manage)で、管理者向けの更新画面(一覧と、非表示・削除)を開く
  const [managing, setManaging] = useHashFlag("manage");
  const [view, setView] = useState<ContentView>("raw");

  if (state.status === "loading") return <p role="status">読み込んでいます…</p>;
  if (state.status === "error")
    return (
      <div className="alert alert-danger" role="alert">
        {state.message}
      </div>
    );

  const { event, session, opinions, latest, analysis } = state.data;
  const visible = event.status === "active" && session.status === "active";
  const themePath = withBase(`/admin/events/${encodeURIComponent(eventId)}/sessions/${encodeURIComponent(sessionId)}`);

  return (
    <>
      <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
        <span className="text-body-secondary small text-break">
          {event.name}
          <span className={`badge ms-2 ${session.status === "active" ? "text-bg-primary" : session.status === "draft" ? "text-bg-warning" : "text-bg-secondary"}`}>
            {SESSION_STATUS_LABELS[session.status]}
          </span>
          {session.status === "active" && session.deadlineAt && (
            <span className="ms-2">
              <TimerBadge deadlineAt={session.deadlineAt} serverNow={new Date().toISOString()} onExpire={reload} />
            </span>
          )}
        </span>
        {/* 参加者に見える画面そのもの。URLのコピーやQRは、イベントの招待URLの画面にある */}
        <a className="btn icon-btn btn-sm btn-outline-secondary flex-shrink-0" href={withBase(`/e/${encodeURIComponent(eventId)}`)} target="_blank" rel="noreferrer" aria-label="参加者の画面を見る" title="参加者の画面を見る">👀</a>
      </div>
      {!visible && (
        <div className="alert alert-warning" role="status">
          参加者が投稿できるのは、イベントとテーマが、両方とも「公開中」のときだけです。
          <a className="alert-link ms-1" href={`${themePath}/edit`}>
            テーマの設定を開く
          </a>
        </div>
      )}
      <ViewTabs view={view} onChange={setView} summaryAvailable={latest !== null} />
      {view === "summary" && latest ? (
        <section aria-label="要約">
          <SummaryPublishToggle api={api} session={session} describeError={describeError} onChanged={reload} />
          <SummaryView
            audience="admin"
            opinions={opinions}
            data={{
              overview: latest.run.result!.overview,
              clusters: latest.run.result!.clusters.map((c) => ({ ...c, opinionCount: c.opinionIds.length })),
              unclassifiedCount: latest.run.result!.unclassifiedOpinionIds.length,
              unclassifiedOpinionIds: latest.run.result!.unclassifiedOpinionIds,
              insights: latest.insights.map((i) => ({ clusterId: i.clusterId, content: i.edited ?? i.ai, approved: i.approved })),
              newOpinionCount: latest.run.newOpinionCount,
            }}
          />
        </section>
      ) : (
      <section aria-label="投稿された意見">
        {managing ? (
          <OpinionManager api={api} opinions={opinions} describeError={describeError} reload={reload} onBack={() => setManaging(false)} />
        ) : (
          <OpinionBoard opinions={opinions} analysis={analysis} reload={reload} />
        )}
      </section>
      )}
      {!managing && (
        <>
          <hr />
          <AnalysisPanel api={api} sessionId={sessionId} opinions={opinions} describeError={describeError} />
          <hr />
          <ThemeMenu eventId={eventId} sessionId={sessionId} />
        </>
      )}
    </>
  );
}

/** このテーマでできることの入口。設定と議論の記録は、それぞれ別の画面で行う */
function ThemeMenu({ eventId, sessionId }: { eventId: string; sessionId: string }) {
  const base = withBase(`/admin/events/${encodeURIComponent(eventId)}/sessions/${encodeURIComponent(sessionId)}`);
  return (
    <nav aria-label="このテーマの操作">
      <div className="row row-cols-3 g-2">
        {[
          { href: `${base}/edit`, emoji: "⚙️", label: "テーマの設定" },
          { href: `${base}/notes`, emoji: "📝", label: "議論の記録" },
        ].map((item) => (
          <div className="col" key={item.href}>
            <a className="menu-tile btn btn-outline-secondary h-100" href={item.href} aria-label={item.label} title={item.label}>
              <span className="menu-emoji" aria-hidden="true">
                {item.emoji}
              </span>
              <span className="menu-label" aria-hidden="true">
                {item.label}
              </span>
            </a>
          </div>
        ))}
      </div>
    </nav>
  );
}

/** 要約を参加者に公開するか。AIの要約なので、運営者が確認してから公開する。採用した案だけが、一緒に出る */
function SummaryPublishToggle({
  api,
  session,
  describeError,
  onChanged,
}: {
  api: AdminApi;
  session: SessionRecord;
  describeError: (e: unknown) => string;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(published: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateSession(session.id, { summaryPublished: published });
      await onChanged();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3">
      <div className="form-check">
        <input
          id="summary-published"
          type="checkbox"
          className="form-check-input"
          checked={session.summaryPublished === true}
          disabled={busy}
          onChange={(e) => void change(e.target.checked)}
        />
        <label htmlFor="summary-published" className="form-check-label">
          この要約を参加者に公開する
        </label>
      </div>
      <p className="small text-body-secondary mb-0">公開すると、参加者は「要約（AI）」を見られます。案は、採用したものだけが出ます。</p>
      {error && (
        <div className="text-danger small" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

/** 不適切な投稿の非表示・再表示・削除。削除は元に戻せない */
