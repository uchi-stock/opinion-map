import type { EventRecord, OpinionRecord, SessionRecord } from "../domain/types.js";

/**
 * 永続化の境界。サービス層は、この型だけに依存する。
 * テストでは in-memory 実装に差し替え、本番では DynamoDB 実装を使う。
 */
export interface EventRepository {
  create(event: EventRecord): Promise<void>;
  get(id: string): Promise<EventRecord | undefined>;
  list(): Promise<EventRecord[]>;
  update(event: EventRecord): Promise<void>;
}

export interface SessionRepository {
  create(session: SessionRecord): Promise<void>;
  get(id: string): Promise<SessionRecord | undefined>;
  listByEvent(eventId: string): Promise<SessionRecord[]>;
  update(session: SessionRecord): Promise<void>;
}

export interface OpinionRepository {
  /**
   * 同じ送信IDの投稿がなければ作成する。あれば既存の投稿を返す（二重送信の防止）。
   * 実装は、確認と作成を不可分に行うこと（DynamoDB では条件付き書き込み）。
   */
  createIfAbsent(opinion: OpinionRecord): Promise<{ opinion: OpinionRecord; created: boolean }>;
  listBySession(sessionId: string): Promise<OpinionRecord[]>;
}

export interface Repositories {
  events: EventRepository;
  sessions: SessionRepository;
  opinions: OpinionRepository;
}
