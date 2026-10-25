import { useState, type FormEvent } from "react";
import { ApiError, deleteOpinion, editOpinion } from "../api/client.ts";
import type { PublicOpinion } from "../api/types.ts";
import { charLength } from "../lib/text.ts";

/**
 * 自分の投稿の、編集と削除。編集用の鍵がこのブラウザにある投稿にだけ出す。
 * 削除すると、本文は消え、戻せない。
 */
export function MyOpinionActions({
  opinion,
  editKey,
  maxLength = 300,
  canEdit,
  onEdited,
  onDeleted,
}: {
  opinion: PublicOpinion;
  editKey: string;
  maxLength?: number;
  /** 受け付け中のときだけ、編集できる */
  canEdit: boolean;
  onEdited: (updated: PublicOpinion) => void;
  onDeleted: (id: string) => void;
}) {
  const [mode, setMode] = useState<"idle" | "editing" | "confirmDelete">("idle");
  const [body, setBody] = useState(opinion.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = body.trim();
  const valid = trimmed.length > 0 && charLength(trimmed) <= maxLength;

  async function act(f: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await f();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "うまくいきませんでした。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    void act(async () => {
      const result = await editOpinion(opinion.id, { editKey, body: trimmed });
      onEdited(result.opinion);
      setMode("idle");
    });
  }

  function remove() {
    void act(async () => {
      await deleteOpinion(opinion.id, editKey);
      onDeleted(opinion.id);
    });
  }

  return (
    <div className="mb-2 ms-1 small" aria-label="自分の投稿の操作" role="group">
      {mode === "idle" && (
        <div className="d-flex gap-3">
          {canEdit && (
            <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setMode("editing")}>
              編集する
            </button>
          )}
          <button type="button" className="btn btn-link btn-sm p-0 text-danger" onClick={() => setMode("confirmDelete")}>
            削除する
          </button>
        </div>
      )}
      {mode === "editing" && (
        <form onSubmit={save} aria-label="投稿の編集">
          <label htmlFor={`edit-${opinion.id}`} className="form-label mb-1">
            意見を直す
          </label>
          <textarea
            id={`edit-${opinion.id}`}
            className="form-control mb-1"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="form-text mb-2">
            {charLength(trimmed)} / {maxLength}文字
          </div>
          <button type="submit" className="btn btn-sm btn-primary me-2" disabled={busy || !valid}>
            保存する
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setMode("idle")}>
            やめる
          </button>
        </form>
      )}
      {mode === "confirmDelete" && (
        <div>
          <p className="mb-1">この意見を削除します。元に戻せません。</p>
          <button type="button" className="btn btn-sm btn-danger me-2" disabled={busy} onClick={remove}>
            削除する
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setMode("idle")}>
            やめる
          </button>
        </div>
      )}
      {error && (
        <div className="alert alert-danger mt-2 mb-0" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
