import { useEffect, useState } from "react";
import { listNotes } from "../api/client.ts";
import type { NotesEntry } from "../api/types.ts";
import { NotesView } from "./NotesView.tsx";

/** 運営者が公開した、全テーマの議論の記録。公開されたものが無ければ、何も出さない */
export function PublishedNotes({ eventId }: { eventId: string }) {
  const [entries, setEntries] = useState<NotesEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    listNotes(eventId).then(
      (list) => {
        if (!cancelled) setEntries(list);
      },
      () => {
        // 記録の欄が出ないだけで、テーマの閲覧と投稿は続けられる
      },
    );
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (entries.length === 0) return null;
  return (
    <section aria-label="議論の記録" className="mt-4">
      <hr />
      <h2 className="h5">議論の記録</h2>
      <p className="small text-body-secondary">各テーマで出た結論と、次の行動です。運営者が公開したものだけを表示しています。</p>
      <NotesView entries={entries} />
    </section>
  );
}
