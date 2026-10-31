import { useState, type FormEvent } from "react";
import type { AdminApi } from "../../api/admin.ts";
import type { SessionFormat } from "../../api/types.ts";
import { AdminShell } from "../../components/admin/AdminShell.tsx";
import { FORMAT_LABELS } from "../../lib/labels.ts";
import { withBase } from "../../lib/paths.ts";

export function AdminSessionNewPage({ eventId }: { eventId: string }) {
  const eventPath = withBase(`/admin/events/${encodeURIComponent(eventId)}`);
  return (
    <AdminShell title="テーマを追加" back={{ href: eventPath, label: "イベント" }}>
      {({ api, describeError }) => (
        <SessionCreateForm
          api={api}
          eventId={eventId}
          describeError={describeError}
          // 作ったら、そのテーマのページへ移る(「公開中」にして、参加者に見せるため)
          onCreated={(sessionId) => window.location.assign(`${eventPath}/sessions/${encodeURIComponent(sessionId)}`)}
        />
      )}
    </AdminShell>
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
  onCreated: (sessionId: string) => void | Promise<void>;
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
      const created = await api.createSession(eventId, {
        title: title.trim(),
        prompt: prompt.trim(),
        format,
        showOpinionsToParticipants: show,
      });
      await onCreated(created.id);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={create} aria-label="テーマを作る">
      <label htmlFor="ss-title" className="form-label">
        テーマ名
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
