import { useState, type FormEvent } from "react";
import type { AdminApi } from "../../api/admin.ts";
import { ApiError } from "../../api/client.ts";
import { withBase } from "../../lib/paths.ts";
import { useLoad } from "../../lib/useLoad.ts";
import { CopyField } from "./CopyField.tsx";

/** 運営者に渡すリンク。トークンは `#` のあとに付け、サーバーやログに残さない */
export function operatorLink(token: string): string {
  return `${window.location.origin}${withBase("/admin")}#token=${encodeURIComponent(token)}`;
}

/**
 * 運営者のリンクの発行と失効。オーナーだけが使える。
 * 運営者のトークンで開いたときは、権限がないので、何も表示しない。
 */
export function OperatorTokenSection({
  api,
  eventId,
  describeError,
}: {
  api: AdminApi;
  eventId: string;
  describeError: (e: unknown) => string;
}) {
  const { state, reload } = useLoad(() => api.listOperatorTokens(eventId), (e) => (e instanceof ApiError && e.status === 403 ? "forbidden" : describeError(e)), [api, eventId]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ label: string; link: string } | null>(null);

  if (state.status === "error" && state.message === "forbidden") return null;
  if (state.status === "loading") return null;

  async function issue(e: FormEvent) {
    e.preventDefault();
    if (busy || !label.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const token = await api.issueOperatorToken(eventId, label.trim());
      setIssued({ label: token.label, link: operatorLink(token.token) });
      setLabel("");
      await reload();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.revokeOperatorToken(id);
      await reload();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const tokens = state.status === "ready" ? state.data : [];

  return (
    <section aria-label="運営者のリンク">
      <h2 className="h6">運営者のリンク</h2>
      <p className="small text-body-secondary">
        このイベントだけを操作できるリンクです。リンクを知っている人は運営できるので、渡す相手に気をつけてください。
        リンクは、発行したときにしか表示されません。
      </p>
      <form onSubmit={issue} className="mb-3" aria-label="リンクの発行">
        <label htmlFor="op-label" className="form-label">
          渡す相手の名前（例: 会場係）
        </label>
        <input id="op-label" className="form-control mb-2" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button type="submit" className="btn btn-outline-primary w-100" disabled={busy || !label.trim()}>
          リンクを発行する
        </button>
      </form>
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      {issued && (
        <div className="alert alert-success">
          <p className="mb-2">「{issued.label}」のリンクを発行しました。この画面を閉じると、もう表示できません。</p>
          <CopyField label="渡すリンク" value={issued.link} />
        </div>
      )}
      {tokens.length === 0 && <p className="text-body-secondary">発行したリンクはありません。</p>}
      <ul className="list-unstyled">
        {tokens.map((t) => (
          <li key={t.id} className="d-flex justify-content-between align-items-center mb-2">
            <span>
              {t.label}
              {t.revokedAt && <span className="badge text-bg-secondary ms-2">失効済み</span>}
            </span>
            {!t.revokedAt && (
              <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => void revoke(t.id)} aria-label={`${t.label}のリンクを失効する`}>
                失効する
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
