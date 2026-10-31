import { useState, type FormEvent } from "react";
import type { AdminApi } from "../../api/admin.ts";
import type { EventRecord, EventStatus, SessionFormat, SessionRecord } from "../../api/types.ts";
import { AdminShell } from "../../components/admin/AdminShell.tsx";
import { CopyField } from "../../components/admin/CopyField.tsx";
import { QrCode } from "../../components/admin/QrCode.tsx";
import { ProposalAdminSection } from "../../components/admin/ProposalAdminSection.tsx";
import { OperatorTokenSection } from "../../components/admin/OperatorTokenSection.tsx";
import { eventInviteUrl, EVENT_STATUS_LABELS, FORMAT_LABELS, SESSION_STATUS_LABELS } from "../../lib/labels.ts";
import { withBase } from "../../lib/paths.ts";
import { useLoad } from "../../lib/useLoad.ts";

export function AdminEventPage({ eventId }: { eventId: string }) {
  return (
    <AdminShell title="イベント" back={{ href: withBase("/admin"), label: "イベント一覧" }}>
      {({ api, describeError }) => <EventContent api={api} describeError={describeError} eventId={eventId} />}
    </AdminShell>
  );
}

function EventContent({
  api,
  describeError,
  eventId,
}: {
  api: AdminApi;
  describeError: (e: unknown) => string;
  eventId: string;
}) {
  const { state, reload } = useLoad(
    async () => {
      const [events, sessions] = await Promise.all([api.listEvents(), api.listSessions(eventId)]);
      const event = events.find((e) => e.id === eventId);
      if (!event) throw new Error("not_found");
      return { event, sessions };
    },
    (e) => (e instanceof Error && e.message === "not_found" ? "イベントが見つかりません。" : describeError(e)),
    [api, eventId],
  );

  if (state.status === "loading") return <p role="status">読み込んでいます…</p>;
  if (state.status === "error")
    return (
      <div className="alert alert-danger" role="alert">
        {state.message}
      </div>
    );
  return (
    <>
      <EventForm api={api} event={state.data.event} describeError={describeError} onSaved={reload} />
      <hr />
      <InviteSection eventId={eventId} />
      <hr />
      <h2 className="h6">テーマ（セッション）</h2>
      <CurrentThemeNote event={state.data.event} api={api} describeError={describeError} onChanged={reload} />
      {state.data.sessions.length === 0 && <p className="text-body-secondary">まだセッションがありません。</p>}
      {state.data.sessions.map((session) => (
        <div key={session.id} className="mb-2">
        <a
          href={withBase(`/admin/events/${encodeURIComponent(eventId)}/sessions/${encodeURIComponent(session.id)}`)}
          className="card text-decoration-none"
        >
          <div className="card-body py-2 d-flex justify-content-between align-items-center">
            <span className="text-body">
              {session.title}
              {isOpenSession(state.data.event, state.data.sessions, session) && <span className="badge text-bg-primary ms-2">開いている</span>}
            </span>
            <span className="badge text-bg-secondary">{SESSION_STATUS_LABELS[session.status]}</span>
          </div>
        </a>
        <CurrentThemeButton
          api={api}
          event={state.data.event}
          sessions={state.data.sessions}
          session={session}
          describeError={describeError}
          onChanged={reload}
        />
        </div>
      ))}
      <SessionCreateForm api={api} eventId={eventId} describeError={describeError} onCreated={reload} />
      <ProposalAdminSection
        api={api}
        event={state.data.event}
        sessions={state.data.sessions}
        describeError={describeError}
        onChanged={reload}
      />
      <OperatorTokenSection api={api} eventId={eventId} describeError={describeError} />
    </>
  );
}

/** 参加者に配る招待URL。イベントごとに1つで、テーマは運営者が切り替える */
function InviteSection({ eventId }: { eventId: string }) {
  const url = eventInviteUrl(eventId);
  return (
    <section aria-label="参加者の招待URL">
      <h2 className="h6">参加者の招待URL</h2>
      <p className="small text-body-secondary">
        イベントごとに1つです。参加者はこのURLから、いまのテーマに投稿でき、すべてのテーマを見られます。
      </p>
      <CopyField label="招待URL" value={url} />
      <div className="mb-3">
        <QrCode value={url} label="招待URLのQRコード" />
      </div>
    </section>
  );
}

/** いま開いているテーマか。選ばれていなければ、公開中のテーマすべてが開いている */
export function isOpenSession(event: EventRecord, sessions: SessionRecord[], session: SessionRecord): boolean {
  if (session.status !== "active") return false;
  const selected = selectedOpenIds(event);
  return selected === undefined ? sessions.some((s) => s.id === session.id) : selected.includes(session.id);
}

function selectedOpenIds(event: EventRecord): string[] | undefined {
  if (event.openSessionIds !== undefined) return event.openSessionIds;
  if (event.currentSessionId !== undefined) return [event.currentSessionId];
  return undefined;
}

function CurrentThemeNote({
  event,
  api,
  describeError,
  onChanged,
}: {
  event: EventRecord;
  api: AdminApi;
  describeError: (e: unknown) => string;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = selectedOpenIds(event) !== undefined;

  async function clear() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateEvent(event.id, { openSessionIds: null });
      await onChanged();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="small text-body-secondary mb-2">
      <p className="mb-1">
        {selected
          ? "参加者が投稿できるのは、「開いている」テーマだけです。複数のテーマを同時に開けます。閉じたテーマは、見るだけになります。"
          : "いまは、公開中のテーマすべてに投稿できます。テーマの下のボタンで、開くテーマを選ぶと、そのテーマだけに投稿できます。"}
      </p>
      {selected && (
        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => void clear()}>
          選択を解除する（公開中のテーマすべてを開く）
        </button>
      )}
      {error && (
        <span className="text-danger ms-2" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/** 「開く」「閉じる」。公開中のテーマだけ。複数を同時に開ける */
function CurrentThemeButton({
  api,
  event,
  sessions,
  session,
  describeError,
  onChanged,
}: {
  api: AdminApi;
  event: EventRecord;
  sessions: SessionRecord[];
  session: SessionRecord;
  describeError: (e: unknown) => string;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = isOpenSession(event, sessions, session);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // 選択がまだ無いときは、いま開いているテーマ(公開中のすべて)を出発点にする
      const current = new Set(sessions.filter((s) => isOpenSession(event, sessions, s)).map((s) => s.id));
      if (open) current.delete(session.id);
      else current.add(session.id);
      await api.updateEvent(event.id, { openSessionIds: [...current] });
      await onChanged();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  if (session.status === "draft") return null;
  return (
    <div className="mt-1 ms-1 small">
      <button
        type="button"
        className={`btn btn-sm ${open ? "btn-outline-secondary" : "btn-outline-primary"}`}
        disabled={busy || session.status === "closed"}
        onClick={() => void toggle()}
        aria-label={`${session.title}を${open ? "閉じる" : "開く"}`}
      >
        {open ? "閉じる" : "開く"}
      </button>
      {session.status === "closed" && <span className="ms-2 text-body-secondary">終了したテーマです</span>}
      {error && (
        <span className="text-danger ms-2" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function EventForm({
  api,
  event,
  describeError,
  onSaved,
}: {
  api: AdminApi;
  event: EventRecord;
  describeError: (e: unknown) => string;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState(event.description);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function run(patch: Parameters<AdminApi["updateEvent"]>[1]) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.updateEvent(event.id, patch);
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
    if (!name.trim()) return;
    void run({ name: name.trim(), description: description.trim() });
  }

  return (
    <form onSubmit={save} aria-label="イベントの設定">
      <label htmlFor="ev-name" className="form-label fw-bold">
        イベント名
      </label>
      <input id="ev-name" className="form-control mb-2" value={name} onChange={(e) => setName(e.target.value)} />
      <label htmlFor="ev-desc" className="form-label">
        説明
      </label>
      <textarea id="ev-desc" className="form-control mb-2" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      <label htmlFor="ev-status" className="form-label fw-bold">
        状態
      </label>
      <select
        id="ev-status"
        className="form-select mb-1"
        value={event.status}
        disabled={busy}
        onChange={(e) => void run({ status: e.target.value as EventStatus })}
      >
        {(Object.keys(EVENT_STATUS_LABELS) as EventStatus[]).map((s) => (
          <option key={s} value={s}>
            {EVENT_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <div className="form-text mb-3">参加者に見えるのは、「公開中」のイベントのセッションだけです。</div>
      <button type="submit" className="btn btn-primary w-100" disabled={busy || !name.trim()}>
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

function SessionCreateForm({
  api,
  eventId,
  describeError,
  onCreated,
}: {
  api: AdminApi;
  eventId: string;
  describeError: (e: unknown) => string;
  onCreated: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState<SessionFormat>("workshop");
  const [show, setShow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = title.trim().length > 0 && prompt.trim().length > 0;

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      await api.createSession(eventId, {
        title: title.trim(),
        prompt: prompt.trim(),
        format,
        showOpinionsToParticipants: show,
      });
      setTitle("");
      setPrompt("");
      await onCreated();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={create} className="mt-4" aria-label="セッションを作る">
      <h2 className="h6">セッションを作る</h2>
      <label htmlFor="ss-title" className="form-label">
        セッション名
      </label>
      <input id="ss-title" className="form-control mb-2" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label htmlFor="ss-prompt" className="form-label">
        参加者への問い
      </label>
      <textarea id="ss-prompt" className="form-control mb-2" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <label htmlFor="ss-format" className="form-label">
        形式
      </label>
      <select id="ss-format" className="form-select mb-2" value={format} onChange={(e) => setFormat(e.target.value as SessionFormat)}>
        {(Object.keys(FORMAT_LABELS) as SessionFormat[]).map((f) => (
          <option key={f} value={f}>
            {FORMAT_LABELS[f]}
          </option>
        ))}
      </select>
      <div className="form-check mb-3">
        <input id="ss-show" type="checkbox" className="form-check-input" checked={show} onChange={(e) => setShow(e.target.checked)} />
        <label htmlFor="ss-show" className="form-check-label">
          投稿された意見を、参加者にも見せる
        </label>
      </div>
      <button type="submit" className="btn btn-primary w-100" disabled={busy || !valid}>
        {busy ? "作っています…" : "作る"}
      </button>
      {error && (
        <div className="alert alert-danger mt-3" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
