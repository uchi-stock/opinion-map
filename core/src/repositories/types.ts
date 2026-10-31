import type { AnalysisRunRecord, AnalysisRunSummary } from "../analysis/types.js";
import type { InsightRecord } from "../insights/types.js";
import type { AdminRecord, ProposalRecord, ReactionRecord, EventRecord, OperatorTokenRecord, OpinionRecord, SessionRecord } from "../domain/types.js";

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
  /** 同じ送信IDの投稿があれば返す（重複の確認に使う） */
  findBySubmission(sessionId: string, submissionId: string): Promise<OpinionRecord | undefined>;
  get(id: string): Promise<OpinionRecord | undefined>;
  update(opinion: OpinionRecord): Promise<void>;
  /** 公開中（active）の投稿だけ。古い順。参加者の表示と分析の入力に使う */
  listBySession(sessionId: string): Promise<OpinionRecord[]>;
  /** 運営者向け。公開中と、非表示（hidden）の投稿。削除済みは含まない。古い順 */
  listManageableBySession(sessionId: string): Promise<OpinionRecord[]>;
  /** 指定の時刻以降に作られた投稿の数。状態にかかわらず数える（頻度の制限に使う） */
  countCreatedSince(sessionId: string, sinceIso: string): Promise<number>;
}

export interface AnalysisRunRepository {
  // 入力の投稿(本文)は大きいので、update は入力を書き換えない。入力を書き換えるのは replaceInput だけ。
  // 一覧(listBySession)は、本文を持たない軽い形を返す。
  /**
   * 同じセッションに、進行中（queued か running）の実行がなければ作る。あれば、その実行を返す。
   * 重複した実行を防ぐため、確認と作成は不可分に行うこと（DynamoDB では条件付き書き込み）。
   */
  createIfNoActive(run: AnalysisRunRecord): Promise<{ run: AnalysisRunRecord; created: boolean }>;
  get(id: string): Promise<AnalysisRunRecord | undefined>;
  /** 状態・結果・エラーなどを更新する。入力の投稿は、書き換えない */
  update(run: AnalysisRunRecord): Promise<void>;
  /** 入力の投稿を書き換える(投稿の削除で、本文を消すときだけ使う) */
  replaceInput(run: AnalysisRunRecord): Promise<void>;
  /** 古い順。入力の本文を持たない軽い形 */
  listBySession(sessionId: string): Promise<AnalysisRunSummary[]>;
}

export interface OperatorTokenRepository {
  create(token: OperatorTokenRecord): Promise<void>;
  get(id: string): Promise<OperatorTokenRecord | undefined>;
  /** 認証で使う。ハッシュは一意である */
  getByHash(tokenHash: string): Promise<OperatorTokenRecord | undefined>;
  /** 古い順 */
  listByEvent(eventId: string): Promise<OperatorTokenRecord[]>;
  update(token: OperatorTokenRecord): Promise<void>;
}

export interface ReactionRepository {
  /** なければ作って true。すでにあれば false(同じ投票者の二重投票を防ぐ) */
  add(reaction: ReactionRecord): Promise<boolean>;
  /** 消せたら true。なければ false */
  remove(opinionId: string, voterHash: string): Promise<boolean>;
  /** セッションのすべてのリアクション。数の集計に使う */
  listBySession(sessionId: string): Promise<ReactionRecord[]>;
}

/** いま見ている端末の数の目安。端末は、使い捨てのIDのハッシュだけで数える(個人は特定しない) */
export interface PresenceRepository {
  /** 端末が見ている、と記録する。同じ端末は、1つだけ(時刻を更新する)。ttlSeconds 後に消える */
  touch(sessionId: string, deviceHash: string, at: string, ttlSeconds: number): Promise<void>;
  /** since 以降に見ていた端末の数 */
  countSince(sessionId: string, since: string): Promise<number>;
}

export interface ProposalRepository {
  create(proposal: ProposalRecord): Promise<void>;
  get(id: string): Promise<ProposalRecord | undefined>;
  update(proposal: ProposalRecord): Promise<void>;
  /** 古い順 */
  listByEvent(eventId: string): Promise<ProposalRecord[]>;
}

export interface UsageRepository {
  /**
   * 1日あたりの利用を1回分、使う。上限に達していれば使わず、allowed を false にする。
   * 並行して呼ばれても、上限を超えない(DynamoDB では、1回分ごとの印を、条件付きで作る)。
   */
  consume(scope: string, dayKey: string, limit: number): Promise<{ allowed: boolean; used: number }>;
  /** いまの利用回数(読むだけ) */
  used(scope: string, dayKey: string): Promise<number>;
}

export interface AdminRepository {
  get(email: string): Promise<AdminRecord | undefined>;
  /** 古い順 */
  list(): Promise<AdminRecord[]>;
  /** なければ作って true。すでにあれば何もせず false（並行して来ても1つだけ作る） */
  createIfAbsent(admin: AdminRecord): Promise<boolean>;
  /** 消せたら true。なければ false */
  remove(email: string): Promise<boolean>;
}

export interface InsightRepository {
  create(insight: InsightRecord): Promise<void>;
  get(id: string): Promise<InsightRecord | undefined>;
  update(insight: InsightRecord): Promise<void>;
  /** 古い順 */
  listByAnalysis(analysisRunId: string): Promise<InsightRecord[]>;
}

export interface Repositories {
  events: EventRepository;
  sessions: SessionRepository;
  opinions: OpinionRepository;
  analyses: AnalysisRunRepository;
  operatorTokens: OperatorTokenRepository;
  admins: AdminRepository;
  reactions: ReactionRepository;
  proposals: ProposalRepository;
  usage: UsageRepository;
  presence: PresenceRepository;
  insights: InsightRepository;
}
