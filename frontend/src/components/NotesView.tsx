import type { NotesEntry } from "../api/types.ts";

/** 議論の記録を読む表示。参加者には公開済みのものだけが渡される */
export function NotesView({ entries, showPublishState = false }: { entries: NotesEntry[]; showPublishState?: boolean }) {
  return (
    <div className="d-flex flex-column gap-3">
      {entries.map((e) => (
        <article key={e.sessionId} className="card" data-testid="notes-entry">
          <div className="card-body py-2">
            <h3 className="h6 d-flex justify-content-between align-items-center">
              <span>{e.title}</span>
              {showPublishState && <span className={`badge ${e.published ? "text-bg-success" : "text-bg-secondary"}`}>{e.published ? "公開中" : "未公開"}</span>}
            </h3>
            <div className="small fw-bold">結論</div>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{e.notes.conclusion || "（未記入）"}</p>
            <div className="small fw-bold">次の行動</div>
            {e.notes.nextActions.length === 0 ? (
              <p className="text-body-secondary small">なし</p>
            ) : (
              <ul>
                {e.notes.nextActions.map((a, i) => (
                  <li key={i} style={{ overflowWrap: "anywhere" }}>
                    {a.text}
                    {a.owner && <span className="text-body-secondary">（担当: {a.owner}）</span>}
                  </li>
                ))}
              </ul>
            )}
            <div className="small fw-bold">未解決の問い</div>
            {e.notes.openQuestions.length === 0 ? (
              <p className="text-body-secondary small mb-0">なし</p>
            ) : (
              <ul className="mb-0">
                {e.notes.openQuestions.map((q, i) => (
                  <li key={i} style={{ overflowWrap: "anywhere" }}>
                    {q}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
