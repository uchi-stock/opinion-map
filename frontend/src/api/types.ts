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
}

export interface PublicOpinion {
  id: string;
  body: string;
  kind: OpinionKind;
  createdAt: string;
}

export interface OpinionList {
  hidden: boolean;
  opinions: PublicOpinion[];
}

export interface OpinionSubmission {
  body: string;
  kind: OpinionKind;
  submissionId: string;
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
