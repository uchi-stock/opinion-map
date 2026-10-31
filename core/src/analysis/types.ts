import type { OpinionKind } from "../domain/types.js";

/** 分析の実行の状態 */
export type AnalysisStatus = "queued" | "running" | "succeeded" | "failed";

export interface AnalysisOpinion {
  id: string;
  body: string;
  kind: OpinionKind;
}

/** 分析基盤へ渡す入力。実行を始めた時点の投稿のスナップショットである */
export interface AnalysisRequest {
  /** 分析の実行のID。分析基盤側の名前に使う */
  runId: string;
  sessionId: string;
  /** セッションの問い */
  question: string;
  opinions: AnalysisOpinion[];
}

export interface AnalysisCluster {
  id: string;
  /** 階層の深さ。1が最も大きなまとまり */
  level: number;
  parentId: string | null;
  title: string;
  summary: string;
  /** 属する元の投稿のID。重複しない。1つの投稿が、複数のクラスタに属してもよい */
  opinionIds: string[];
}

/** 分析基盤が返す結果。アプリ側で検証してから使う */
export interface RawAnalysisResult {
  overview: string;
  clusters: AnalysisCluster[];
}

/** 検証済みの結果。結果のどのクラスタにも現れなかった投稿も、必ず持つ */
export interface AnalysisResult extends RawAnalysisResult {
  unclassifiedOpinionIds: string[];
}

export type ProviderRunState =
  | { status: "running" }
  | { status: "succeeded" }
  | { status: "failed"; errorCode: string; errorSummary: string };

/**
 * 分析基盤との境界。分析は時間がかかるため、開始・状態の確認・結果の取得に分ける。
 * 分析基盤に固有の構造は、実装の中に閉じ込め、アプリ全体へ漏らさない。
 */
export interface AnalysisProvider {
  readonly name: string;
  start(request: AnalysisRequest): Promise<{ providerRunId: string }>;
  poll(providerRunId: string): Promise<ProviderRunState>;
  /** 結果を取得する。opinions は、実行を始めたときの入力である */
  fetchResult(providerRunId: string, opinions: readonly AnalysisOpinion[]): Promise<RawAnalysisResult>;
}

/** 1回の分析で扱える投稿の数の上限。保存先の項目の大きさ(400KB)に収めるための数 */
export const MAX_ANALYSIS_OPINIONS = 1500;

export interface AnalysisRunRecord {
  id: string;
  sessionId: string;
  status: AnalysisStatus;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  providerName: string;
  providerRunId?: string;
  /** 再試行の元になった実行のID */
  retryOf?: string;
  /** 実行を始めた時点の投稿。あとで投稿が増えても、変わらない */
  input: { opinions: AnalysisOpinion[]; hash: string };
  error?: { code: string; summary: string };
  result?: AnalysisResult;
}

/**
 * 一覧用の、軽い形。入力の投稿の本文を持たず、IDと件数だけを持つ。
 * 本文は大きいので、一覧のたびには読まない(必要なときに、get で全体を読む)。
 */
export interface AnalysisRunSummary extends Omit<AnalysisRunRecord, "input"> {
  input: { hash: string; opinionIds: string[] };
}

/** 実行(全体でも、軽い形でも)の入力にある投稿のID */
export function inputOpinionIds(run: AnalysisRunRecord | AnalysisRunSummary): string[] {
  return "opinions" in run.input ? run.input.opinions.map((o) => o.id) : run.input.opinionIds;
}
