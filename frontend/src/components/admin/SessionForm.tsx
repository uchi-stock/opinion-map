import { useState, type FormEvent } from "react";
import type { AdminApi } from "../../api/admin.ts";
import type { SessionFormat, SessionRecord, SessionStatus } from "../../api/types.ts";
import { FORMAT_LABELS, SESSION_STATUS_LABELS } from "../../lib/labels.ts";

/** テーマの設定フォーム(名前、問い、形式、状態、制限時間、意見を見せるか) */
export function SessionForm({
  api,
  session,
  describeError,
  onSaved,
}: {
  api: AdminApi;
  session: SessionRecord;
  describeError: (e: unknown) => string;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(session.title);
  const [prompt, setPrompt] = useState(session.prompt);
  const [format, setFormat] = useState<SessionFormat>(session.format);
  const [show, setShow] = useState(session.showOpinionsToParticipants);
  // 制限時間(分)。空なら、制限なし
  const [minutes, setMinutes] = useState(session.timerSeconds === undefined ? "" : String(session.timerSeconds / 60));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const minutesNum = minutes.trim() === "" ? null : Number(minutes);
  const minutesValid = minutesNum === null || (Number.isInteger(minutesNum) && minutesNum >= 1 && minutesNum <= 1440);
  const valid = title.trim().length > 0 && prompt.trim().length > 0 && minutesValid;

  async function run(patch: Parameters<AdminApi["updateSession"]>[1]) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.updateSession(session.id, patch);
      await onSaved();
      setMessage({ kind: "ok", text: "保存しました。" });
    } catch (e) {
      setMessage({ kind: "error", text: describeError(e) });
    } finally {
      setBusy(false);
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    void run({ title: title.trim(), prompt: prompt.trim(), format, showOpinionsToParticipants: show, timerSeconds: minutesNum === null ? null : minutesNum * 60 });
  }

  return (
    <form onSubmit={save} aria-label="テーマの設定">
      <label htmlFor="se-status" className="form-label fw-bold">
        状態
      </label>
      <select
        id="se-status"
        className="form-select mb-3"
        value={session.status}
        disabled={busy}
        onChange={(e) => void run({ status: e.target.value as SessionStatus })}
      >
        {(Object.keys(SESSION_STATUS_LABELS) as SessionStatus[]).map((s) => (
          <option key={s} value={s}>
            {SESSION_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <label htmlFor="se-title" className="form-label">
        テーマ名
      </label>
      <input id="se-title" className="form-control mb-2" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label htmlFor="se-prompt" className="form-label">
        参加者への問い
      </label>
      <textarea id="se-prompt" className="form-control mb-2" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <label htmlFor="se-format" className="form-label">
        形式
      </label>
      <select id="se-format" className="form-select mb-2" value={format} onChange={(e) => setFormat(e.target.value as SessionFormat)}>
        {(Object.keys(FORMAT_LABELS) as SessionFormat[]).map((f) => (
          <option key={f} value={f}>
            {FORMAT_LABELS[f]}
          </option>
        ))}
      </select>
      <label htmlFor="se-timer" className="form-label">
        制限時間（分・任意）
      </label>
      <input
        id="se-timer"
        type="number"
        inputMode="numeric"
        min={1}
        max={1440}
        className={`form-control mb-1 ${minutesValid ? "" : "is-invalid"}`}
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        placeholder="空なら、制限なし"
      />
      <p className="form-text mb-2">
        「公開中」にした時点から数えます。時間が来ると、投稿を締め切り、AIの分析を自動で始めます。
      </p>
      <div className="form-check mb-3">
        <input id="se-show" type="checkbox" className="form-check-input" checked={show} onChange={(e) => setShow(e.target.checked)} />
        <label htmlFor="se-show" className="form-check-label">
          投稿された意見を、参加者にも見せる
        </label>
      </div>
      <button type="submit" className="btn icon-btn btn-primary w-100" disabled={busy || !valid} aria-label="保存する" title="保存する">💾</button>
      <div aria-live="polite">
        {message && (
          <div className={`alert alert-${message.kind === "ok" ? "success" : "danger"} mt-3 mb-0`} role={message.kind === "error" ? "alert" : undefined}>
            {message.text}
          </div>
        )}
      </div>
    </form>
  );
}
