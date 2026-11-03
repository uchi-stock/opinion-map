import { useEffect, useId, useRef, useState } from "react";
import { ApiError, extractCandidates, postOpinion } from "../../api/client.ts";
import type { OpinionCandidate, OpinionKind } from "../../api/types.ts";
import { useWakeLock } from "../../hooks/useWakeLock.js";
import { newEditKey, rememberMyOpinion } from "../../lib/myOpinions.ts";
import { newSubmissionId } from "../../lib/submissionId.ts";
import { splitTranscript } from "../../lib/splitTranscript.ts";
import { KIND_LABELS } from "../../lib/text.ts";
import { loadTranscriptDraft, saveTranscriptDraft } from "../../lib/transcriptDraft.ts";
import { useTranscriber } from "../../lib/useTranscriber.ts";

const KINDS: OpinionKind[] = ["idea", "experience", "question"];

/** 画面の中の付箋の候補。使う人が、選んで、直せる */
interface Draft extends OpinionCandidate {
  id: number;
  selected: boolean;
}

function messageOf(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}

/** 録音と、話した内容の文字(直せる)。文字の下書きは、この端末にだけ残す */
function useTranscript(sessionId: string) {
  const [text, setText] = useState(() => loadTranscriptDraft(sessionId));
  const update = (next: string | ((prev: string) => string)) =>
    setText((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      saveTranscriptDraft(sessionId, value);
      return value;
    });
  const transcriber = useTranscriber((heard) => update((prev) => (prev === "" ? heard : `${prev}\n${heard}`)));
  // 録音中は、画面が消えて止まらないようにする
  useWakeLock(transcriber.recording);
  return { text, update, transcriber };
}

function RecordControls({ transcriber, disabled }: { transcriber: ReturnType<typeof useTranscriber>; disabled: boolean }) {
  const { supported, recording, error, start, stop } = transcriber;
  return (
    <div className="mb-3">
      {supported ? (
        <button
          type="button"
          className={`btn icon-btn w-100 ${recording ? "btn-danger" : "btn-outline-primary"}`}
          onClick={recording ? stop : start}
          disabled={disabled && !recording}
          aria-label={recording ? "録音をとめる" : "録音を始める"}
          title={recording ? "録音をとめる" : "録音を始める"}
        >
          {recording ? "⏹️" : "🎙️"}
        </button>
      ) : (
        <p className="small text-body-secondary mb-0">この端末の画面では、音声の録音を使えません。話した内容は、下の欄に文字で入れてください。</p>
      )}
      {recording && (
        <p className="small text-danger mt-2 mb-0" role="status">
          録音しています。話した内容を、文字にしています。
        </p>
      )}
      {error && (
        <div className="alert alert-warning mt-2 mb-0" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

function CandidateList({
  drafts,
  onChange,
  maxLength,
}: {
  drafts: Draft[];
  onChange: (id: number, patch: Partial<Draft>) => void;
  maxLength: number;
}) {
  return (
    <ul className="list-unstyled mb-3">
      {drafts.map((d) => (
        <li key={d.id} className="card card-body p-2 mb-2">
          <div className="d-flex align-items-center gap-2 mb-1">
            <input
              type="checkbox"
              className="form-check-input mt-0"
              checked={d.selected}
              onChange={(e) => onChange(d.id, { selected: e.target.checked })}
              aria-label="この付箋を投稿する"
            />
            <select
              className="form-select form-select-sm w-auto"
              value={d.kind}
              onChange={(e) => onChange(d.id, { kind: e.target.value as OpinionKind })}
              aria-label="付箋の種類"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="form-control form-control-sm"
            rows={2}
            maxLength={maxLength}
            value={d.body}
            onChange={(e) => onChange(d.id, { body: e.target.value })}
            aria-label="付箋の内容"
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * 話した内容から、付箋を作る画面(#record)。
 * 音声は、端末の中で文字にする(サーバーには送らない)。文字を AI に渡して付箋の候補を作り、
 * 使う人が確かめて、直してから、ふつうの投稿として送る。誰が話したかは、記録しない。
 */
export function RecordScreen({
  accepting,
  sessionId,
  onBack,
  onPosted,
  maxLength = 300,
}: {
  /** いま投稿を受け付けているか。受け付けていなければ、候補を作ることも投稿もできない */
  accepting: boolean;
  sessionId: string;
  onBack: () => void;
  onPosted: (count: number) => void;
  maxLength?: number;
}) {
  const textId = useId();
  const { text, update, transcriber } = useTranscript(sessionId);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState<"making" | "posting" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(1);
  // 投稿の再送が重複しないよう、候補ごとの送信IDと鍵を、送り終わるまで持つ
  const attempts = useRef(new Map<number, { submissionId: string; editKey: string }>());
  useEffect(() => () => attempts.current.clear(), []);

  const selected = drafts.filter((d) => d.selected && d.body.trim() !== "");

  async function makeCandidates() {
    setBusy("making");
    setError(null);
    try {
      const found: OpinionCandidate[] = [];
      for (const chunk of splitTranscript(text)) found.push(...(await extractCandidates(sessionId, chunk)));
      setDrafts(found.map((c) => ({ ...c, id: nextId.current++, selected: true })));
      if (found.length === 0) setError("付箋にできる意見が見つかりませんでした。話した内容を直して、もう一度お試しください。");
    } catch (e) {
      setError(messageOf(e, "付箋の候補を作れませんでした。もう一度お試しください。"));
    } finally {
      setBusy(null);
    }
  }

  async function postSelected() {
    setBusy("posting");
    setError(null);
    const failed = new Set<number>();
    let posted = 0;
    for (const d of selected) {
      const attempt = attempts.current.get(d.id) ?? { submissionId: newSubmissionId(), editKey: newEditKey() };
      attempts.current.set(d.id, attempt);
      try {
        const result = await postOpinion(sessionId, { body: d.body.trim(), kind: d.kind, ...attempt });
        rememberMyOpinion(result.opinion.id, attempt.editKey);
        attempts.current.delete(d.id);
        posted++;
      } catch (e) {
        failed.add(d.id);
        setError(messageOf(e, "投稿に失敗した付箋があります。もう一度お試しください。"));
      }
    }
    setBusy(null);
    if (failed.size === 0) {
      update("");
      onPosted(posted);
      return;
    }
    // 投稿できたものは候補から外し、失敗したものだけを残す
    setDrafts((prev) => prev.filter((d) => failed.has(d.id)));
  }

  return (
    <>
      <div className="mb-3">
        <button type="button" className="btn icon-btn btn-sm btn-outline-secondary" onClick={onBack} aria-label="ボードへ戻る" title="ボードへ戻る">
          ⬅️
        </button>
      </div>
      <section className="mb-3" aria-label="話した内容から付箋を作る">
        <h2 className="h6">話した内容から、付箋を作る</h2>
        <p className="small text-body-secondary">
          音声は、この端末の中で文字にします。サーバーには送りません。付箋の候補を作るときだけ、文字を外部のAIサービスに送ります。
          名前など、個人が分かる内容は、送る前に消してください。AIの候補は参考です。確かめて、直してから投稿してください。
        </p>
        {!accepting && (
          <div className="alert alert-secondary" role="status">
            現在、投稿を受け付けていません。
          </div>
        )}
        <RecordControls transcriber={transcriber} disabled={!accepting} />
        <label htmlFor={textId} className="form-label fw-bold">
          話した内容（文字）
        </label>
        <textarea
          id={textId}
          className="form-control mb-2"
          rows={8}
          value={text}
          onChange={(e) => update(e.target.value)}
          placeholder="録音すると、ここに文字が入ります。直したり、文字を入れたりもできます。"
        />
        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn icon-btn btn-primary flex-grow-1"
            disabled={!accepting || busy !== null || text.trim() === ""}
            onClick={() => void makeCandidates()}
            aria-label="付箋の候補を作る"
            title="付箋の候補を作る"
          >
            {busy === "making" ? "⏳" : "🪄"}
          </button>
          <button
            type="button"
            className="btn icon-btn btn-outline-secondary"
            disabled={busy !== null || text === ""}
            onClick={() => update("")}
            aria-label="文字を消す"
            title="文字を消す"
          >
            🗑️
          </button>
        </div>
      </section>
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      {drafts.length > 0 && (
        <section aria-label="付箋の候補">
          <h2 className="h6">付箋の候補（{selected.length}件を選んでいます）</h2>
          <CandidateList drafts={drafts} maxLength={maxLength} onChange={(id, patch) => setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))} />
          <button
            type="button"
            className="btn icon-btn btn-success w-100"
            disabled={!accepting || busy !== null || selected.length === 0}
            onClick={() => void postSelected()}
            aria-label="選んだ付箋を投稿する"
            title="選んだ付箋を投稿する"
          >
            {busy === "posting" ? "⏳" : "✅"}
          </button>
        </section>
      )}
    </>
  );
}
