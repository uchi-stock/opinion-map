import { useState, type FormEvent } from "react";
import type { AdminApi } from "../../api/admin.ts";
import { AdminListSection } from "../../components/admin/AdminListSection.tsx";
import { AdminShell } from "../../components/admin/AdminShell.tsx";
import { EVENT_STATUS_LABELS } from "../../lib/labels.ts";
import { withBase } from "../../lib/paths.ts";
import { useLoad } from "../../lib/useLoad.ts";

export function AdminEventsPage() {
  return (
    <AdminShell title="イベント">
      {({ api, describeError }) => <EventsContent api={api} describeError={describeError} />}
    </AdminShell>
  );
}

function EventsContent({
  api,
  describeError,
}: {
  api: AdminApi;
  describeError: (e: unknown) => string;
}) {
  const { state, reload } = useLoad(() => api.listEvents(), describeError, [api]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.createEvent({ name: name.trim(), description: description.trim() });
      setName("");
      setDescription("");
      await reload();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="mb-4" aria-label="イベント一覧">
        {state.status === "loading" && <p role="status">読み込んでいます…</p>}
        {state.status === "error" && (
          <div className="alert alert-danger" role="alert">
            {state.message}
          </div>
        )}
        {state.status === "ready" && state.data.length === 0 && (
          <p className="text-body-secondary">まだイベントがありません。下のフォームから作ってください。</p>
        )}
        {state.status === "ready" &&
          state.data.map((event) => (
            <a
              key={event.id}
              href={withBase(`/admin/events/${encodeURIComponent(event.id)}`)}
              className="card mb-2 text-decoration-none"
            >
              <div className="card-body py-2 d-flex justify-content-between align-items-center">
                <span className="text-body">{event.name}</span>
                <span className="badge text-bg-secondary">{EVENT_STATUS_LABELS[event.status]}</span>
              </div>
            </a>
          ))}
      </section>

      <form onSubmit={create} aria-label="イベントを作る">
        <h2 className="h6">イベントを作る</h2>
        <label htmlFor="event-name" className="form-label">
          イベント名
        </label>
        <input id="event-name" className="form-control mb-2" value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="event-description" className="form-label">
          説明（任意）
        </label>
        <textarea
          id="event-description"
          className="form-control mb-3"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button type="submit" className="btn btn-primary w-100" disabled={saving || !name.trim()}>
          {saving ? "作っています…" : "作る"}
        </button>
        {error && (
          <div className="alert alert-danger mt-3" role="alert">
            {error}
          </div>
        )}
      </form>

      <AdminListSection api={api} describeError={describeError} />
    </>
  );
}
