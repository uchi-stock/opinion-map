import { useState } from "react";
import type { AdminApi } from "../../api/admin.ts";
import type { AdminOpinion } from "../../api/types.ts";

export function ModerationControls({
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
          <button type="button" className="btn icon-btn btn-sm btn-danger me-2" disabled={busy} onClick={() => void run("deleted")} aria-label="削除する" title="削除する">🗑️</button>
          <button type="button" className="btn icon-btn btn-sm btn-outline-secondary" onClick={() => setConfirming(false)} aria-label="やめる" title="やめる">✖️</button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="btn icon-btn btn-link btn-sm p-0 me-3"
            disabled={busy}
            onClick={() => void run(hidden ? "active" : "hidden")}
            aria-label={hidden ? "表示に戻す" : "非表示にする"}
            title={hidden ? "表示に戻す" : "非表示にする"}
          >
            {hidden ? "👁️" : "🙈"}
          </button>
          <button type="button" className="btn icon-btn btn-link btn-sm p-0 text-danger" disabled={busy} onClick={() => setConfirming(true)} aria-label="削除する" title="削除する">🗑️</button>
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
