export type OpinionKind = "experience" | "question" | "idea";
export type EventStatus = "draft" | "active" | "archived";
export type SessionStatus = "draft" | "active" | "closed";
export type SessionFormat = "talk" | "workshop" | "ost";
/** hidden: 運営者が非表示にした（元に戻せる）。deleted: 削除した（本文は消え、戻せない） */
export type OpinionStatus = "active" | "hidden" | "deleted";

export const OPINION_KINDS: readonly OpinionKind[] = ["experience", "question", "idea"];
export const EVENT_STATUSES: readonly EventStatus[] = ["draft", "active", "archived"];
export const SESSION_STATUSES: readonly SessionStatus[] = ["draft", "active", "closed"];
export const SESSION_FORMATS: readonly SessionFormat[] = ["talk", "workshop", "ost"];

export interface EventRecord {
  id: string;
  name: string;
  description: string;
  status: EventStatus;
  /**
   * いま参加者が投稿できるテーマ(セッション)。招待URLがイベントごとに1つなので、運営者が切り替える。
   * 未設定のイベントは、公開中のセッションすべてに投稿できる(従来の動き)
   */
  currentSessionId?: string;
  /**
   * いま開いている(参加者が投稿できる)テーマ。複数を同時に開ける(OST)。
   * 未設定のイベントは、公開中のテーマすべてが開いている(従来の動き)。
   * currentSessionId は古い形で、あれば、それ1つだけが開いているものとして読む
   */
  openSessionIds?: string[];
  /** 参加者が議題を提案できるか(OST)。既定は受け付けない */
  acceptingProposals?: boolean;
  /** 承認前の提案を、参加者に見せるか。既定は見せない(運営者が確認してから見せる) */
  showPendingProposals?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProposalStatus = "pending" | "approved" | "rejected" | "merged";

/**
 * 参加者が出した議題の提案(OST)。提案者の情報は持たない。
 * 承認するとセッション(テーマ)ができ、統合すると既存のテーマに寄せる。どちらも sessionId で結ぶ。
 */
export interface ProposalRecord {
  id: string;
  eventId: string;
  /** 再送の重複を防ぐ、ブラウザが作る乱数 */
  submissionId: string;
  title: string;
  description: string;
  status: ProposalStatus;
  sessionId?: string;
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
  /** 議論の記録(OST)。結論、次の行動、未解決の問い */
  notes?: SessionNotes;
  /** 記録を参加者に見せるか。既定は見せない(運営者が確認してから公開する) */
  notesPublished?: boolean;
  /** 要約(AIによる分析の結果と、採用された案)を参加者に見せるか。既定は見せない(運営者が確認してから公開する) */
  summaryPublished?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** テーマごとの議論の記録。担当者の名前は文字列だけで、アカウントとは結びつけない */
export interface SessionNotes {
  conclusion: string;
  nextActions: { text: string; owner: string }[];
  openQuestions: string[];
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
  /**
   * 投稿者が、あとで編集・削除するための鍵のハッシュ。鍵は投稿ごとのランダムな値で、
   * 投稿者のブラウザにだけ保存される。投稿どうしを結びつけず、人も特定しない。
   */
  editKeyHash?: string;
  createdAt: string;
  updatedAt: string;
}

/** 参加者に返す投稿の形。許可した項目だけを返す */
export interface PublicOpinion {
  id: string;
  body: string;
  kind: OpinionKind;
  createdAt: string;
  /** いいねの数。一覧のときだけ付く */
  reactionCount?: number;
}

/**
 * 投稿へのリアクション(いいね)。投票者は、ブラウザが作る乱数(voterId)のハッシュだけを持つ。
 * 人は特定しない。同じブラウザは、同じ投稿に1回だけ付けられる。
 */
export interface ReactionRecord {
  sessionId: string;
  opinionId: string;
  voterHash: string;
  createdAt: string;
}

export function toPublicOpinion(o: OpinionRecord): PublicOpinion {
  return { id: o.id, body: o.body, kind: o.kind, createdAt: o.createdAt };
}

/** イベントごとの運営者トークン。本体は保存せず、ハッシュだけを持つ */
/** 管理者(オーナー)。Googleのメールアドレスで識別する。メールは小文字に正規化して持つ */
export interface AdminRecord {
  email: string;
  addedAt: string;
  /** 追加した管理者のメール。環境変数からの初期登録は "(seed)" */
  addedBy: string;
}

export interface OperatorTokenRecord {
  id: string;
  eventId: string;
  /** 配った相手が分かるようにする名前（例: 会場係） */
  label: string;
  tokenHash: string;
  createdAt: string;
  revokedAt?: string;
}
