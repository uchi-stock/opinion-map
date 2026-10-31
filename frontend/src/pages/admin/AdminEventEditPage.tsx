import { useState, type FormEvent } from "react";
import type { AdminApi } from "../../api/admin.ts";
import type { EventRecord, EventStatus } from "../../api/types.ts";
import { AdminShell } from "../../components/admin/AdminShell.tsx";
import { EVENT_STATUS_LABELS } from "../../lib/labels.ts";
import { withBase } from "../../lib/paths.ts";
import { useEventRecord } from "./useEventRecord.ts";

export function AdminEventEditPage({ eventId }: { eventId: string }) {
  return (
    <AdminShell title="イベントの編集" back={{ href: withBase(`/admin/events/${encodeURIComponent(eventId)}`), label: "イベント" }}>
      {({ api, describeError }) => <EditContent api={api} describeError={describeError} eventId={eventId} />}
    </AdminShell>
  );
}

function EditContent({ api, describeError, eventId }: { api: AdminApi; describeError: (e: unknown) => string; eventId: string }) {
  const { state, reload } = useEventRecord(api, eventId, describeError);
  if (state.status === "loading") return <p role="status">読み込んでいます…</p>;
  if (state.status === "error")
    return (
      <div className="alert alert-danger" role="alert">
        {state.message}
      </div>
    );
  return <EventForm api={api} event={state.data} describeError={describeError} onSaved={reload} />;
}

export function EventForm({
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
      <div className="form-text mb-3">参加者に見えるのは、「公開中」のイベントのテーマだけです。</div>
      <button type="submit" className="btn icon-btn btn-primary w-100" disabled={busy || !name.trim()} aria-label="保存する" title="保存する">💾</button>
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
