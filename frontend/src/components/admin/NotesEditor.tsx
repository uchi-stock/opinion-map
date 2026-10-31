import { useState, type FormEvent } from "react";
import type { AdminApi } from "../../api/admin.ts";
import type { SessionNotes } from "../../api/types.ts";

const MAX_ITEMS = 20;

/**
 * テーマごとの議論の記録(結論、次の行動、未解決の問い)。運営者と担当の人が書く。
 * 公開にチェックを入れるまで、参加者には見えない。担当者は名前の文字列だけで、個人情報は書かないよう案内する。
 */
export function NotesEditor({
  api,
  sessionId,
  initial,
  initialPublished,
  describeError,
}: {
  api: AdminApi;
  sessionId: string;
  initial: SessionNotes | undefined;
  initialPublished: boolean;
  describeError: (e: unknown) => string;
}) {
  const [conclusion, setConclusion] = useState(initial?.conclusion ?? "");
  const [actions, setActions] = useState(initial?.nextActions ?? []);
  const [questions, setQuestions] = useState((initial?.openQuestions ?? []).join("\n"));
  const [published, setPublished] = useState(initialPublished);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.saveNotes(sessionId, {
        conclusion: conclusion.trim(),
        nextActions: actions.filter((a) => a.text.trim() !== "").map((a) => ({ text: a.text.trim(), owner: a.owner.trim() })),
        openQuestions: questions.split("\n").map((q) => q.trim()).filter((q) => q !== ""),
        published,
      });
      setMessage({ kind: "ok", text: published ? "保存して、公開しました。" : "保存しました。参加者には見えません。" });
    } catch (err) {
      setMessage({ kind: "error", text: describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="議論の記録">
      <h2 className="h6">議論の記録</h2>
      <p className="small text-body-secondary">
        このテーマで出た結論と、次の行動を残します。担当は名前の文字列だけで、個人が特定される情報は書かないでください。
      </p>
      <form onSubmit={save} aria-label="記録の保存">
        <label htmlFor="notes-conclusion" className="form-label fw-bold">
          結論
        </label>
        <textarea id="notes-conclusion" className="form-control mb-3" rows={3} value={conclusion} onChange={(e) => setConclusion(e.target.value)} />
        <div className="fw-bold mb-1">次の行動</div>
        {actions.map((a, i) => (
          <div key={i} className="d-flex gap-2 mb-2">
            <input
              className="form-control"
              aria-label={`次の行動 ${i + 1}`}
              value={a.text}
              onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
            />
            <input
              className="form-control w-auto"
              style={{ maxWidth: 110 }}
              aria-label={`担当 ${i + 1}`}
              value={a.owner}
              onChange={(e) => setActions(actions.map((x, j) => (j === i ? { ...x, owner: e.target.value } : x)))}
            />
            <button type="button" className="btn btn-outline-danger btn-sm" aria-label={`次の行動 ${i + 1} を消す`} onClick={() => setActions(actions.filter((_, j) => j !== i))}>
              消す
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary mb-3"
          disabled={actions.length >= MAX_ITEMS}
          onClick={() => setActions([...actions, { text: "", owner: "" }])}
        >
          次の行動を足す
        </button>
        <label htmlFor="notes-questions" className="form-label fw-bold d-block">
          未解決の問い（1行に1つ）
        </label>
        <textarea id="notes-questions" className="form-control mb-3" rows={3} value={questions} onChange={(e) => setQuestions(e.target.value)} />
        <div className="form-check mb-3">
          <input id="notes-published" type="checkbox" className="form-check-input" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          <label htmlFor="notes-published" className="form-check-label">
            参加者に公開する
          </label>
        </div>
        <button type="submit" className="btn btn-primary w-100" disabled={busy}>
          記録を保存する
        </button>
        <div aria-live="polite">
          {message && (
            <div className={`alert alert-${message.kind === "ok" ? "success" : "danger"} mt-3 mb-0`} role={message.kind === "error" ? "alert" : undefined}>
              {message.text}
            </div>
          )}
        </div>
      </form>
    </section>
  );
}
