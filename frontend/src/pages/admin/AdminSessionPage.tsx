import { useState, type FormEvent } from "react";
import type { AdminApi } from "../../api/admin.ts";
import type { AdminOpinion, AnalysisRun, Insight, SessionFormat, SessionRecord, SessionStatus } from "../../api/types.ts";
import { AdminShell } from "../../components/admin/AdminShell.tsx";
import { AnalysisPanel, opinionAnchor } from "../../components/admin/AnalysisPanel.tsx";
import { CopyField } from "../../components/admin/CopyField.tsx";
import { QrCode } from "../../components/admin/QrCode.tsx";
import { SummaryView } from "../../components/SummaryView.tsx";
import { ViewTabs, type ContentView } from "../../components/ViewTabs.tsx";
import { StickyBoard, ViewToggle, type ViewMode } from "../../components/StickyBoard.tsx";
import { groupByClusters, groupByKind } from "../../lib/board.ts";
import { NotesEditor } from "../../components/admin/NotesEditor.tsx";
import { OpinionCard } from "../../components/OpinionCard.tsx";
import { FORMAT_LABELS, participantUrl, SESSION_STATUS_LABELS } from "../../lib/labels.ts";
import { withBase } from "../../lib/paths.ts";
import { useLoad } from "../../lib/useLoad.ts";

export function AdminSessionPage({ eventId, sessionId }: { eventId: string; sessionId: string }) {
  return (
    <AdminShell title="セッション" back={{ href: withBase(`/admin/events/${encodeURIComponent(eventId)}`), label: "イベント" }}>
      {({ api, describeError }) => (
        <SessionContent api={api} describeError={describeError} eventId={eventId} sessionId={sessionId} />
      )}
    </AdminShell>
  );
}

/** 最新の分析と、その案。なければ null(ボードは種類ごとにまとめる。要約のビューは出さない) */
async function latestAnalysis(api: AdminApi, sessionId: string): Promise<{ run: AnalysisRun; insights: Insight[] } | null> {
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
    (e) => (e instanceof Error && e.message === "not_found" ? "セッションが見つかりません。" : describeError(e)),
    [api, eventId, sessionId],
  );

  const [mode, setMode] = useState<ViewMode>("list");
  const [view, setView] = useState<ContentView>("raw");

  if (state.status === "loading") return <p role="status">読み込んでいます…</p>;
  if (state.status === "error")
    return (
      <div className="alert alert-danger" role="alert">
        {state.message}
      </div>
    );

  const { event, session, opinions, latest, analysis } = state.data;
  const url = participantUrl(session.id);
  const visible = event.status === "active" && session.status === "active";

  return (
    <>
      <p className="text-body-secondary small mb-3">{event.name}</p>
      {!visible && (
        <div className="alert alert-warning" role="status">
          参加者が投稿できるのは、イベントとセッションが、両方とも「公開中」のときだけです。
        </div>
      )}
      <section aria-label="参加者への共有">
        <CopyField label="参加者のURL" value={url} />
        <div className="mb-4">
          <QrCode value={url} label="参加者のURLのQRコード" />
        </div>
      </section>
      <SessionForm api={api} session={session} describeError={describeError} onSaved={reload} />
      <hr />
      <NotesEditor
        api={api}
        sessionId={session.id}
        initial={session.notes}
        initialPublished={session.notesPublished === true}
        describeError={describeError}
        draftSource={
          latest?.run.result
            ? {
                overview: latest.run.result.overview,
                clusterTitles: latest.run.result.clusters.filter((c) => c.level === Math.min(...latest.run.result!.clusters.map((x) => x.level))).map((c) => c.title),
                questions: latest.insights.flatMap((i) => (i.edited ?? i.ai).questions),
              }
            : null
        }
      />
      <hr />
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
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h2 className="h6 mb-0">投稿された意見（{opinions.length}件）</h2>
          <div className="d-flex gap-2">
            <ViewToggle mode={mode} onChange={setMode} />
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void reload()}>
              更新
            </button>
          </div>
        </div>
        {opinions.length === 0 && <p className="text-body-secondary">まだ投稿はありません。</p>}
        {mode === "board" && opinions.length > 0 && (
          <StickyBoard groups={analysis ? groupByClusters(opinions, analysis) : groupByKind(opinions)} />
        )}
        {mode === "list" &&
          [...opinions].reverse().map((o) => (
          <div key={o.id} id={opinionAnchor(o.id)}>
            <OpinionCard opinion={o} actions={<small className="text-body-secondary">いいね {o.reactionCount ?? 0}</small>} />
            <ModerationControls api={api} opinion={o} describeError={describeError} onChanged={reload} />
          </div>
        ))}
      </section>
      )}
      <hr />
      <AnalysisPanel api={api} sessionId={sessionId} opinions={opinions} describeError={describeError} />
    </>
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
function ModerationControls({
  api,
  opinion,
  describeError,
  onChanged,
}: {
  api: AdminApi;
  opinion: AdminOpinion;
  describeError: (e: unknown) => string;
  onChanged: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hidden = opinion.status === "hidden";

  async function run(status: "active" | "hidden" | "deleted") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.moderateOpinion(opinion.id, status);
      setConfirming(false);
      await onChanged();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-2 ms-1 small">
      {hidden && <span className="badge text-bg-warning me-2">非表示中</span>}
      {confirming ? (
        <>
          <span className="me-2">削除すると、元に戻せません。</span>
          <button type="button" className="btn btn-sm btn-danger me-2" disabled={busy} onClick={() => void run("deleted")}>
            削除する
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setConfirming(false)}>
            やめる
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn btn-link btn-sm p-0 me-3" disabled={busy} onClick={() => void run(hidden ? "active" : "hidden")}>
            {hidden ? "表示に戻す" : "非表示にする"}
          </button>
          <button type="button" className="btn btn-link btn-sm p-0 text-danger" disabled={busy} onClick={() => setConfirming(true)}>
            削除する
          </button>
        </>
      )}
      {error && (
        <div className="alert alert-danger mt-1 mb-0" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

function SessionForm({
  api,
  session,
  describeError,
  onSaved,
}: {
  api: AdminApi;
  session: SessionRecord;
  describeError: (e: unknown) => string;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(session.title);
  const [prompt, setPrompt] = useState(session.prompt);
  const [format, setFormat] = useState<SessionFormat>(session.format);
  const [show, setShow] = useState(session.showOpinionsToParticipants);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const valid = title.trim().length > 0 && prompt.trim().length > 0;

  async function run(patch: Parameters<AdminApi["updateSession"]>[1]) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.updateSession(session.id, patch);
      await onSaved();
      setMessage({ kind: "ok", text: "保存しました。" });
    } catch (e) {
      setMessage({ kind: "error", text: describeError(e) });
    } finally {
      setBusy(false);
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    void run({ title: title.trim(), prompt: prompt.trim(), format, showOpinionsToParticipants: show });
  }

  return (
    <form onSubmit={save} aria-label="セッションの設定">
      <label htmlFor="se-status" className="form-label fw-bold">
        状態
      </label>
      <select
        id="se-status"
        className="form-select mb-3"
        value={session.status}
        disabled={busy}
        onChange={(e) => void run({ status: e.target.value as SessionStatus })}
      >
        {(Object.keys(SESSION_STATUS_LABELS) as SessionStatus[]).map((s) => (
          <option key={s} value={s}>
            {SESSION_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <label htmlFor="se-title" className="form-label">
        セッション名
      </label>
      <input id="se-title" className="form-control mb-2" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label htmlFor="se-prompt" className="form-label">
        参加者への問い
      </label>
      <textarea id="se-prompt" className="form-control mb-2" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <label htmlFor="se-format" className="form-label">
        形式
      </label>
      <select id="se-format" className="form-select mb-2" value={format} onChange={(e) => setFormat(e.target.value as SessionFormat)}>
        {(Object.keys(FORMAT_LABELS) as SessionFormat[]).map((f) => (
          <option key={f} value={f}>
            {FORMAT_LABELS[f]}
          </option>
        ))}
      </select>
      <div className="form-check mb-3">
        <input id="se-show" type="checkbox" className="form-check-input" checked={show} onChange={(e) => setShow(e.target.checked)} />
        <label htmlFor="se-show" className="form-check-label">
          投稿された意見を、参加者にも見せる
        </label>
      </div>
      <button type="submit" className="btn btn-primary w-100" disabled={busy || !valid}>
        保存する
      </button>
      <div aria-live="polite">
        {message && (
          <div className={`alert alert-${message.kind === "ok" ? "success" : "danger"} mt-3 mb-0`} role={message.kind === "error" ? "alert" : undefined}>
            {message.text}
          </div>
        )}
      </div>
    </form>
  );
}
