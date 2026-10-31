import { useState } from "react";
import type { AdminApi } from "../../api/admin.ts";
import { notesToMarkdown } from "../../lib/notesMarkdown.ts";
import { useLoad } from "../../lib/useLoad.ts";
import { NotesView } from "../NotesView.tsx";

/** 全テーマの記録を1画面で見て、Markdown にして持ち帰る(最後の共有の場面で使う) */
export function NotesOverview({
  api,
  eventId,
  eventName,
  describeError,
}: {
  api: AdminApi;
  eventId: string;
  eventName: string;
  describeError: (e: unknown) => string;
}) {
  const { state } = useLoad(() => api.listNotes(eventId), describeError, [api, eventId]);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (state.status !== "ready" || state.data.length === 0) return null;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // コピーできない環境では、下の欄から手で選んでコピーする
      setCopied(false);
    }
  }

  function show() {
    const text = notesToMarkdown(eventName, state.status === "ready" ? state.data : []);
    setMarkdown(text);
    void copy(text);
  }

  return (
    <section aria-label="全テーマの記録">
      <h2 className="h6">全テーマの記録</h2>
      <NotesView entries={state.data} showPublishState />
      <button type="button" className="btn icon-btn btn-sm btn-outline-primary mt-2" onClick={show} aria-label="Markdownにして、コピーする" title="Markdownにして、コピーする">📋</button>
      {markdown !== null && (
        <div className="mt-2">
          {copied && (
            <p className="small text-success" role="status">
              コピーしました。
            </p>
          )}
          <label htmlFor="notes-md" className="form-label small">
            Markdown（コピーできないときは、ここから選んでコピーします）
          </label>
          <textarea id="notes-md" className="form-control font-monospace" rows={8} readOnly value={markdown} />
        </div>
      )}
    </section>
  );
}
