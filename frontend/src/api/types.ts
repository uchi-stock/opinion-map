export type OpinionKind = "experience" | "question" | "idea";

export interface PublicSession {
  id: string;
  title: string;
  prompt: string;
  format: "talk" | "workshop" | "ost";
  status: "draft" | "active" | "closed";
  eventName: string;
  acceptingOpinions: boolean;
  showOpinions: boolean;
  eventId: string;
  /** いま開いている(参加者が投稿できる)テーマか */
  isOpen: boolean;
  /** 公開中の意見の数。イベントの公開情報のときだけ付く */
  opinionCount?: number;
}

/** 招待URL(イベントごとに1つ)から開く画面の情報 */
export interface PublicEvent {
  id: string;
  name: string;
  description: string;
  /** 運営者が開くテーマを選んでいるときの一覧。null なら、公開中のテーマすべてが開いている */
  openSessionIds: string[] | null;
  sessions: PublicSession[];
}

export type ProposalStatus = "pending" | "approved" | "rejected" | "merged";

/** 参加者が出した議題の提案。提案者の情報は持たない */
export interface Proposal {
  id: string;
  title: string;
  description: string;
  status: ProposalStatus;
  /** 承認でできたテーマ、または統合先のテーマ */
  sessionId?: string;
  reactionCount: number;
  createdAt: string;
}

export interface ProposalList {
  accepting: boolean;
  proposals: Proposal[];
}

/** テーマごとの議論の記録(OST)。担当者の名前は文字列だけ */
export interface SessionNotes {
  conclusion: string;
  nextActions: { text: string; owner: string }[];
  openQuestions: string[];
  updatedAt: string;
}

export interface NotesEntry {
  sessionId: string;
  title: string;
  published: boolean;
  notes: SessionNotes;
}

export interface PublicOpinion {
  id: string;
  body: string;
  kind: OpinionKind;
  createdAt: string;
  /** いいねの数。一覧のときだけ付く */
  reactionCount?: number;
}

export interface OpinionList {
  hidden: boolean;
  opinions: PublicOpinion[];
}

export interface AdminOpinionList {
  hidden: boolean;
  opinions: AdminOpinion[];
}

export interface OpinionSubmission {
  body: string;
  kind: OpinionKind;
  submissionId: string;
  /** 投稿者があとで編集・削除するための鍵。ブラウザにだけ保存する */
  editKey?: string;
}

/** 運営者向けの投稿。非表示かどうかを含む */
export interface AdminOpinion extends PublicOpinion {
  status: "active" | "hidden";
}

export interface OpinionResult {
  opinion: PublicOpinion;
  duplicate: boolean;
}

export type EventStatus = "draft" | "active" | "archived";
export type SessionStatus = "draft" | "active" | "closed";
export type SessionFormat = "talk" | "workshop" | "ost";

export interface EventRecord {
  id: string;
  name: string;
  description: string;
  status: EventStatus;
  currentSessionId?: string;
  openSessionIds?: string[];
  acceptingProposals?: boolean;
  showPendingProposals?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  eventId: string;
  title: string;
  prompt: string;
  format: SessionFormat;
  status: SessionStatus;
  showOpinionsToParticipants: boolean;
  notes?: SessionNotes;
  notesPublished?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AnalysisStatus = "queued" | "running" | "succeeded" | "failed";

export interface AnalysisCluster {
  id: string;
  level: number;
  parentId: string | null;
  title: string;
  summary: string;
  opinionIds: string[];
}

export interface AnalysisResult {
  overview: string;
  clusters: AnalysisCluster[];
  /** 分析の入力にあったのに、どのクラスタにも入らなかった投稿 */
  unclassifiedOpinionIds: string[];
}

export interface AnalysisRun {
  id: string;
  sessionId: string;
  status: AnalysisStatus;
  requestedAt: string;
  completedAt?: string;
  providerName: string;
  inputCount: number;
  newOpinionCount: number;
  error?: { code: string; summary: string };
  result?: AnalysisResult;
}

export interface AdminAccount {
  email: string;
  addedAt: string;
  addedBy: string;
}

export interface OperatorToken {
  id: string;
  eventId: string;
  label: string;
  createdAt: string;
  revokedAt?: string;
}

export interface InsightContent {
  commonPoints: string[];
  differences: string[];
  premiseDifferences: string[];
  questions: string[];
}

export interface Insight {
  id: string;
  analysisRunId: string;
  clusterId: string;
  providerName: string;
  /** AIの出力。変更しない */
  ai: InsightContent;
  /** ファシリテーターの編集。AIの出力とは別に持つ */
  edited?: InsightContent;
  approved: boolean;
}
