export type OpinionKind = "experience" | "question" | "idea";
export type EventStatus = "draft" | "active" | "archived";
export type SessionStatus = "draft" | "active" | "closed";
export type SessionFormat = "talk" | "workshop" | "ost";
export type OpinionStatus = "active" | "deleted";

export const OPINION_KINDS: readonly OpinionKind[] = ["experience", "question", "idea"];
export const EVENT_STATUSES: readonly EventStatus[] = ["draft", "active", "archived"];
export const SESSION_STATUSES: readonly SessionStatus[] = ["draft", "active", "closed"];
export const SESSION_FORMATS: readonly SessionFormat[] = ["talk", "workshop", "ost"];

export interface EventRecord {
  id: string;
  name: string;
  description: string;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  eventId: string;
  title: string;
  /** 参加者に提示する問い */
  prompt: string;
  format: SessionFormat;
  status: SessionStatus;
  /** 参加者に投稿済みの意見を見せるか */
  showOpinionsToParticipants: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 投稿。匿名性のため、投稿者を特定できる情報は持たない。
 * submissionId は二重送信を防ぐための、ブラウザが投稿ごとに作る使い捨ての値であり、
 * 利用者を識別しない。API のレスポンスには含めない。
 */
export interface OpinionRecord {
  id: string;
  sessionId: string;
  submissionId: string;
  body: string;
  kind: OpinionKind;
  status: OpinionStatus;
  createdAt: string;
  updatedAt: string;
}

/** 参加者に返す投稿の形。許可した項目だけを返す */
export interface PublicOpinion {
  id: string;
  body: string;
  kind: OpinionKind;
  createdAt: string;
}

export function toPublicOpinion(o: OpinionRecord): PublicOpinion {
  return { id: o.id, body: o.body, kind: o.kind, createdAt: o.createdAt };
}
