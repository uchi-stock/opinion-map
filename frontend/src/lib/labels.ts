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

export function participantUrl(sessionId: string): string {
  return `${window.location.origin}${withBase(`/s/${encodeURIComponent(sessionId)}`)}`;
}
