import type { ReactNode } from "react";
import type { OpinionKind, PublicOpinion } from "../api/types.ts";
import { noteTilt, type BoardGroup } from "../lib/board.ts";
import { KIND_LABELS } from "../lib/text.ts";

/** 付箋の色。色だけでなく、ラベルの文字でも種類を示す */
const NOTE_COLORS: Record<OpinionKind, string> = {
  experience: "#fff3a3",
  question: "#ffd6e7",
  idea: "#c9f0d3",
};

function StickyNote({ opinion, actions }: { opinion: PublicOpinion; actions?: ReactNode }) {
  return (
    <article
      data-testid="sticky-note"
      className="p-2 shadow-sm"
      style={{
        background: NOTE_COLORS[opinion.kind],
        color: "#212529",
        flex: "1 1 140px",
        maxWidth: 220,
        transform: `rotate(${noteTilt(opinion.id)}deg)`,
        borderRadius: 2,
      }}
    >
      <div className="small fw-bold mb-1">{KIND_LABELS[opinion.kind]}</div>
      <p className="mb-1" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {opinion.body}
      </p>
      <div className="small d-flex align-items-center justify-content-between gap-1">
        {actions ?? <span>いいね {opinion.reactionCount ?? 0}</span>}
      </div>
    </article>
  );
}

/**
 * ホワイトボードに付箋を貼ったように、意見を見せる。
 * まとまりごとに区切り、付箋を寄せる。並び順は、いいねの数に左右されない。
 */
export function StickyBoard({
  groups,
  renderActions,
}: {
  groups: BoardGroup[];
  renderActions?: (opinion: PublicOpinion) => ReactNode;
}) {
  if (groups.length === 0) return <p className="text-body-secondary">まだ付箋はありません。</p>;
  return (
    <div className="d-flex flex-column gap-3" data-testid="sticky-board">
      {groups.map((group) => (
        <section
          key={group.id}
          aria-label={group.title}
          className={`rounded border p-2 ${group.unclassified ? "border-warning border-2" : ""} bg-body-tertiary`}
        >
          <h3 className="h6 mb-1">
            {group.title}
            <span className="badge text-bg-secondary ms-2">{group.opinions.length}</span>
          </h3>
          {group.summary && <p className="small text-body-secondary mb-2">{group.summary}</p>}
          {group.unclassified && (
            <p className="small text-body-secondary mb-2">分類されなかった意見です。少数の意見として、そのまま残しています。</p>
          )}
          <div className="d-flex flex-wrap gap-3 p-2">
            {group.opinions.map((o) => (
              <StickyNote key={o.id} opinion={o} actions={renderActions?.(o)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export type ViewMode = "list" | "board";

/** 一覧とボードの切り替え */
export function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="btn-group btn-group-sm" role="group" aria-label="表示の切り替え">
      <button type="button" className={`btn icon-btn ${mode === "list" ? "btn-primary" : "btn-outline-primary"}`} aria-pressed={mode === "list"} onClick={() => onChange("list")} aria-label="一覧" title="一覧">☰</button>
      <button type="button" className={`btn icon-btn ${mode === "board" ? "btn-primary" : "btn-outline-primary"}`} aria-pressed={mode === "board"} onClick={() => onChange("board")} aria-label="ボード" title="ボード">🗒️</button>
    </div>
  );
}
