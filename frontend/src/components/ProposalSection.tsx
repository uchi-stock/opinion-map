import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, listProposals, postProposal, reactToProposal } from "../api/client.ts";
import type { Proposal, ProposalList } from "../api/types.ts";
import { newSubmissionId } from "../lib/submissionId.ts";
import { charLength } from "../lib/text.ts";
import { ReactionButton } from "./ReactionButton.tsx";

const TITLE_MAX = 50;
const DESCRIPTION_MAX = 300;

const STATUS_LABELS: Record<Proposal["status"], string> = {
  pending: "承認待ち",
  approved: "テーマになりました",
  rejected: "",
  merged: "",
};

/**
 * 議題の提案(OST)。参加者が議題を出し、いいねで関心を示す。運営者が承認するとテーマになる。
 * 提案者の情報は送らない。受け付けていないときは、提案済みの一覧だけを出す。
 */
export function ProposalSection({
  eventId,
  onOpenSession,
}: {
  eventId: string;
  /** 承認されてできたテーマへ移る */
  onOpenSession?: (sessionId: string) => void;
}) {
  const [list, setList] = useState<ProposalList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const inFlight = useRef(false);
  // 通信に失敗して結果が分からないとき、同じ内容の再送が重複しないよう、同じ送信IDを使う
  const lastAttempt = useRef<{ id: string; title: string; description: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await listProposals(eventId));
    } catch {
      // 提案の欄が出ないだけで、テーマの閲覧と投稿は続けられる
      setList(null);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    const d = description.trim();
    if (inFlight.current || t.length === 0 || charLength(t) > TITLE_MAX || charLength(d) > DESCRIPTION_MAX) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setDone(false);
    const previous = lastAttempt.current;
    const attempt = previous && previous.title === t && previous.description === d ? previous : { id: newSubmissionId(), title: t, description: d };
    lastAttempt.current = attempt;
    try {
      await postProposal(eventId, { submissionId: attempt.id, title: t, description: d });
      lastAttempt.current = null;
      setTitle("");
      setDescription("");
      setDone(true);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "提案に失敗しました。もう一度お試しください。");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!list || (!list.accepting && list.proposals.length === 0)) return null;
  const canSubmit = title.trim().length > 0 && charLength(title.trim()) <= TITLE_MAX && charLength(description.trim()) <= DESCRIPTION_MAX && !busy;

  return (
    <section aria-label="議題の提案" className="mb-4">
      <h2 className="h5">議題の提案</h2>
      {list.accepting ? (
        <form onSubmit={submit} aria-label="議題を提案する" className="mb-3" noValidate>
          <label htmlFor="proposal-title" className="form-label">
            話したい議題（{TITLE_MAX}文字まで）
          </label>
          <input id="proposal-title" className="form-control mb-2" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label htmlFor="proposal-desc" className="form-label">
            ひとこと（任意、{DESCRIPTION_MAX}文字まで）
          </label>
          <textarea id="proposal-desc" className="form-control mb-2" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          <p className="small text-body-secondary mb-2">名前は不要です。個人が特定される情報は書かないでください。</p>
          <button type="submit" className="btn btn-primary w-100" disabled={!canSubmit}>
            {busy ? "送っています…" : "議題を提案する"}
          </button>
          {error && (
            <div className="alert alert-danger mt-2 mb-0" role="alert">
              {error}
            </div>
          )}
          {done && (
            <div className="alert alert-success mt-2 mb-0" role="status">
              提案しました。運営者が確認します。
            </div>
          )}
        </form>
      ) : (
        <p className="small text-body-secondary">いまは、議題の提案を受け付けていません。</p>
      )}
      {list.proposals.length === 0 ? (
        <p className="text-body-secondary small">表示できる提案はまだありません。</p>
      ) : (
        <ul className="list-unstyled">
          {list.proposals.map((p) => (
            <li key={p.id} className="card mb-2" data-testid="proposal">
              <div className="card-body py-2">
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <strong style={{ overflowWrap: "anywhere" }}>{p.title}</strong>
                  <span className={`badge ${p.status === "approved" ? "text-bg-success" : "text-bg-secondary"}`}>{STATUS_LABELS[p.status]}</span>
                </div>
                {p.description && (
                  <p className="small mb-1" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {p.description}
                  </p>
                )}
                <div className="d-flex align-items-center gap-2">
                  <ReactionButton opinionId={p.id} count={p.reactionCount} disabled={false} onChanged={() => void load()} react={reactToProposal} />
                  {p.status === "approved" && p.sessionId && onOpenSession && (
                    <button type="button" className="btn btn-sm btn-outline-success" onClick={() => onOpenSession(p.sessionId!)}>
                      このテーマを開く
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
