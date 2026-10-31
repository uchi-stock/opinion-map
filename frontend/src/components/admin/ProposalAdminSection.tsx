import { useState } from "react";
import type { AdminApi } from "../../api/admin.ts";
import type { EventRecord, Proposal, SessionRecord } from "../../api/types.ts";
import { useLoad } from "../../lib/useLoad.ts";

const STATUS_LABELS: Record<Proposal["status"], string> = {
  pending: "承認待ち",
  approved: "承認済み",
  rejected: "却下",
  merged: "統合済み",
};

/**
 * 議題の提案(OST)の管理。受け付けの開閉、承認前の提案を参加者に見せるか、承認・却下・統合。
 * 承認すると、公開中のテーマができる(開くテーマを選んでいるイベントでは、そのテーマも開く)。
 */
export function ProposalAdminSection({
  api,
  event,
  sessions,
  describeError,
  onChanged,
}: {
  api: AdminApi;
  event: EventRecord;
  sessions: SessionRecord[];
  describeError: (e: unknown) => string;
  /** 承認でテーマが増えたり、設定が変わったりしたとき、画面全体を読み直す */
  onChanged: () => Promise<void>;
}) {
  const { state, reload } = useLoad(() => api.listProposals(event.id), describeError, [api, event.id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<Record<string, string>>({});

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
      await onChanged();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  const proposals = state.status === "ready" ? state.data : [];
  const targets = sessions.filter((s) => s.status !== "draft");

  return (
    <section aria-label="議題の提案">
      <h2 className="h6">議題の提案（OST）</h2>
      <p className="small text-body-secondary">
        参加者が議題を出し、いいねで関心を示します。承認すると、公開中のテーマができます。提案者は記録されません。
      </p>
      <div className="form-check mb-1">
        <input
          id="accepting-proposals"
          type="checkbox"
          className="form-check-input"
          checked={event.acceptingProposals === true}
          disabled={busy}
          onChange={(e) => void run(() => api.updateEvent(event.id, { acceptingProposals: e.target.checked }))}
        />
        <label htmlFor="accepting-proposals" className="form-check-label">
          議題の提案を受け付ける
        </label>
      </div>
      <div className="form-check mb-3">
        <input
          id="show-pending"
          type="checkbox"
          className="form-check-input"
          checked={event.showPendingProposals === true}
          disabled={busy}
          onChange={(e) => void run(() => api.updateEvent(event.id, { showPendingProposals: e.target.checked }))}
        />
        <label htmlFor="show-pending" className="form-check-label">
          承認前の提案を、参加者にも見せる
        </label>
      </div>
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      {state.status === "error" && (
        <div className="alert alert-warning" role="alert">
          {state.message}
        </div>
      )}
      {state.status === "ready" && proposals.length === 0 && <p className="text-body-secondary">まだ提案はありません。</p>}
      <ul className="list-unstyled">
        {proposals.map((p) => (
          <li key={p.id} className="card mb-2" data-testid="admin-proposal">
            <div className="card-body py-2">
              <div className="d-flex justify-content-between align-items-start gap-2">
                <strong style={{ overflowWrap: "anywhere" }}>{p.title}</strong>
                <span className="badge text-bg-secondary">{STATUS_LABELS[p.status]}</span>
              </div>
              {p.description && (
                <p className="small mb-1" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {p.description}
                </p>
              )}
              <p className="small text-body-secondary mb-1">いいね {p.reactionCount}</p>
              {p.status === "pending" && (
                <div className="d-flex flex-wrap gap-2 align-items-center">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={busy}
                    aria-label={`${p.title}を承認する`}
                    onClick={() => void run(() => api.decideProposal(p.id, { status: "approved" }))}
                  >
                    承認する
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    disabled={busy}
                    aria-label={`${p.title}を却下する`}
                    onClick={() => void run(() => api.decideProposal(p.id, { status: "rejected" }))}
                  >
                    却下する
                  </button>
                  {targets.length > 0 && (
                    <>
                      <select
                        className="form-select form-select-sm w-auto"
                        aria-label={`${p.title}の統合先`}
                        value={mergeTarget[p.id] ?? ""}
                        onChange={(e) => setMergeTarget({ ...mergeTarget, [p.id]: e.target.value })}
                      >
                        <option value="">統合先を選ぶ</option>
                        {targets.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={busy || !mergeTarget[p.id]}
                        aria-label={`${p.title}を統合する`}
                        onClick={() => void run(() => api.decideProposal(p.id, { status: "merged", intoSessionId: mergeTarget[p.id]! }))}
                      >
                        統合する
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
