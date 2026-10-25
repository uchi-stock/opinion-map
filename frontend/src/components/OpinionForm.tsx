import { useId, useRef, useState, type FormEvent } from "react";
import { ApiError, postOpinion as defaultPostOpinion } from "../api/client.ts";
import type { OpinionKind, OpinionResult, OpinionSubmission } from "../api/types.ts";
import { newSubmissionId } from "../lib/submissionId.ts";
import { charLength, KIND_LABELS } from "../lib/text.ts";

export const DEFAULT_MAX_LENGTH = 300;

interface Props {
  sessionId: string;
  maxLength?: number;
  onSubmitted: (result: OpinionResult) => void;
  postOpinion?: (sessionId: string, submission: OpinionSubmission) => Promise<OpinionResult>;
}

const KINDS: OpinionKind[] = ["idea", "experience", "question"];

export function OpinionForm({ sessionId, maxLength = DEFAULT_MAX_LENGTH, onSubmitted, postOpinion = defaultPostOpinion }: Props) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<OpinionKind>("idea");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // 状態の更新を待たずに、連打を防ぐ
  const inFlight = useRef(false);
  // 通信に失敗して結果が分からないとき、同じ内容の再送が重複しないよう、同じ送信IDを使う
  const lastAttempt = useRef<{ id: string; body: string; kind: OpinionKind } | null>(null);
  const textId = useId();
  const counterId = useId();

  const trimmed = body.trim();
  const length = charLength(trimmed);
  const tooLong = length > maxLength;
  const canSubmit = trimmed.length > 0 && !tooLong && !submitting;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || trimmed.length === 0 || tooLong) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    setDone(false);

    const previous = lastAttempt.current;
    const reuse = previous && previous.body === trimmed && previous.kind === kind;
    const attempt = reuse ? previous : { id: newSubmissionId(), body: trimmed, kind };
    lastAttempt.current = attempt;

    try {
      const result = await postOpinion(sessionId, { body: trimmed, kind, submissionId: attempt.id });
      lastAttempt.current = null;
      setBody("");
      setDone(true);
      onSubmitted(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "投稿に失敗しました。もう一度お試しください。");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="意見の投稿フォーム">
      <fieldset className="mb-3" disabled={submitting}>
        <legend className="fs-6 fw-bold">投稿の種類</legend>
        <div className="d-flex flex-wrap gap-3">
          {KINDS.map((k) => (
            <div className="form-check" key={k}>
              <input
                className="form-check-input"
                type="radio"
                name="kind"
                id={`${textId}-${k}`}
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
              />
              <label className="form-check-label" htmlFor={`${textId}-${k}`}>
                {KIND_LABELS[k]}
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="mb-2">
        <label htmlFor={textId} className="form-label fw-bold">
          あなたの意見
        </label>
        <textarea
          id={textId}
          className={`form-control${tooLong ? " is-invalid" : ""}`}
          rows={4}
          value={body}
          disabled={submitting}
          onChange={(e) => {
            setBody(e.target.value);
            setDone(false);
          }}
          aria-describedby={counterId}
          aria-invalid={tooLong}
        />
        <div id={counterId} className={`form-text text-end${tooLong ? " text-danger" : ""}`}>
          {length} / {maxLength}文字
          {tooLong ? "（文字数が多すぎます）" : ""}
        </div>
      </div>

      <button type="submit" className="btn btn-primary w-100" disabled={!canSubmit}>
        {submitting ? "送信しています…" : "投稿する"}
      </button>

      <div aria-live="polite">
        {done && <div className="alert alert-success mt-3 mb-0">投稿しました。ありがとうございます。</div>}
      </div>
      <div role="alert">{error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}</div>
    </form>
  );
}
