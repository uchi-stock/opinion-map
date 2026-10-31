import { withBase } from "./paths.ts";
import type { EventStatus, SessionFormat, SessionStatus } from "../api/types.ts";

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: "下書き",
  active: "公開中",
  archived: "アーカイブ",
};

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  draft: "下書き",
  active: "公開中",
  closed: "終了",
};

export const FORMAT_LABELS: Record<SessionFormat, string> = {
  talk: "講演",
  workshop: "ワークショップ",
  ost: "オープンスペース",
};

/** 招待URL。イベントごとに1つで、テーマの切り替えは運営者が行う */
export function eventInviteUrl(eventId: string): string {
  return `${window.location.origin}${withBase(`/e/${encodeURIComponent(eventId)}`)}`;
}

/** 日付(日本時間)。例: 2026/10/31。読めない値は、そのまま返す */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" }).format(date);
}
