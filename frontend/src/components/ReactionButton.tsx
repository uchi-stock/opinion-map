import { useState } from "react";
import { ApiError, reactToOpinion } from "../api/client.ts";
import { getVoterId, loadReacted, saveReacted } from "../lib/reactions.ts";

/**
 * 「いいね」のボタン。押すと付き、もう一度押すと外れる。
 * 数は、色だけでなく文字でも示す。受け付けを終えたら、押せない。
 */
export function ReactionButton({
  opinionId,
  count,
  disabled,
  onChanged,
  react = reactToOpinion,
}: {
  opinionId: string;
  count: number;
  disabled: boolean;
  onChanged: (count: number) => void;
  /** いいねを送る関数。提案へのいいねでは、提案用のものを渡す */
  react?: (id: string, voterId: string, reacted: boolean) => Promise<{ reacted: boolean; count: number }>;
}) {
  const [reacted, setReacted] = useState(() => loadReacted().has(opinionId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await react(opinionId, getVoterId(), !reacted);
      const ids = loadReacted();
      if (result.reacted) ids.add(opinionId);
      else ids.delete(opinionId);
      saveReacted(ids);
      setReacted(result.reacted);
      onChanged(result.count);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "うまくいきませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="d-flex align-items-center gap-2">
      <button
        type="button"
        className={`btn icon-btn btn-sm ${reacted ? "btn-primary" : "btn-outline-primary"}`}
        aria-pressed={reacted}
        disabled={disabled || busy}
        onClick={() => void toggle()}
        aria-label={`${reacted ? "いいね済み" : "いいね"} ${count}`}
        title={reacted ? "いいね済み" : "いいね"}
      >
        {reacted ? "❤️" : "🤍"} {count}
      </button>
      {error && (
        <small className="text-danger" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
