import { useState, type FormEvent } from "react";
import type { AdminApi } from "../../api/admin.ts";
import { AdminShell } from "../../components/admin/AdminShell.tsx";
import { withBase } from "../../lib/paths.ts";

export function AdminEventNewPage() {
  return (
    <AdminShell title="イベントを作る" back={{ href: withBase("/admin"), label: "イベント一覧" }}>
      {({ api, describeError }) => (
        <EventCreateForm
          api={api}
          describeError={describeError}
          // 作ったら、そのイベントのページへ移る(テーマの追加など、続きの設定をするため)
          onCreated={(eventId) => window.location.assign(withBase(`/admin/events/${encodeURIComponent(eventId)}`))}
        />
      )}
    </AdminShell>
  );
}

function EventCreateForm({
  api,
  describeError,
  onCreated,
}: {
  api: AdminApi;
  describeError: (e: unknown) => string;
  onCreated: (eventId: string) => void;
}) {
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
      const created = await api.createEvent({ name: name.trim(), description: description.trim() });
      onCreated(created.id);
    } catch (e) {
      setError(describeError(e));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={create} aria-label="イベントを作る">
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
  );
}
