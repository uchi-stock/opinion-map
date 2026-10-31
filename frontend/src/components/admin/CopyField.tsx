import { useId, useRef, useState } from "react";

type Result = "copied" | "manual" | null;

/** URLの表示とコピー。クリップボードのAPIが無い環境では、手でコピーできるよう文字を選択する */
export function CopyField({ label, value }: { label: string; value: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<Result>(null);

  async function copy() {
    input.current?.select();
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(value);
        setResult("copied");
        return;
      }
    } catch {
      // 権限がない場合などは、下の案内にする
    }
    setResult("manual");
  }

  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label fw-bold">
        {label}
      </label>
      <div className="input-group">
        <input id={id} ref={input} className="form-control" readOnly value={value} onFocus={(e) => e.target.select()} />
        <button type="button" className="btn icon-btn btn-outline-primary" onClick={() => void copy()} aria-label="コピー" title="コピー">📋</button>
      </div>
      <div aria-live="polite" className="form-text">
        {result === "copied" && "コピーしました。"}
        {result === "manual" && "コピーできませんでした。選択された文字を、長押ししてコピーしてください。"}
      </div>
    </div>
  );
}
