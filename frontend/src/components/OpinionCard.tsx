import type { ReactNode } from "react";
import type { PublicOpinion } from "../api/types.ts";
import { KIND_LABELS } from "../lib/text.ts";

const timeFormat = new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" });

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : timeFormat.format(date);
}

/**
 * 意見のカード。本文は文字列として描画する（React が自動でエスケープする）。
 * 種類は、色だけでなく文字のラベルでも示す。
 */
export function OpinionCard({ opinion, actions }: { opinion: PublicOpinion; actions?: ReactNode }) {
  return (
    <article className="card mb-2" data-testid="opinion-card">
      <div className="card-body py-2">
        <div className="d-flex justify-content-between align-items-center mb-1">
          <span className="badge text-bg-secondary">{KIND_LABELS[opinion.kind]}</span>
          <small className="text-body-secondary">{formatTime(opinion.createdAt)}</small>
        </div>
        <p className="card-text mb-0" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {opinion.body}
        </p>
        {actions && <div className="mt-2">{actions}</div>}
      </div>
    </article>
  );
}
