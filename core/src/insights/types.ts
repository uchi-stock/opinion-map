import type { AnalysisOpinion } from "../analysis/types.js";

/** 議論の材料。どれも、AIの案であり、事実や合意を表さない */
export interface InsightContent {
  /** 共通している点。「一致している」ことは意味しない */
  commonPoints: string[];
  /** 意見どうしの違い */
  differences: string[];
  /** 前提の違い（同じ言葉でも、前提が違うために食い違う点） */
  premiseDifferences: string[];
  /** 議論の問いの案 */
  questions: string[];
}

export interface InsightRequest {
  /** テーマの問い */
  question: string;
  clusterTitle: string;
  clusterSummary: string;
  opinions: AnalysisOpinion[];
}

/** 共通点・相違点・問いを案として作る、LLMの呼び出し。出力は、アプリ側で検証してから使う */
export interface InsightProvider {
  readonly name: string;
  generate(request: InsightRequest): Promise<unknown>;
}

/**
 * 1つのクラスタの案。
 * AIの出力（ai）は変更せず、ファシリテーターの編集は別（edited）に持つ。
 */
export interface InsightRecord {
  id: string;
  analysisRunId: string;
  sessionId: string;
  clusterId: string;
  providerName: string;
  createdAt: string;
  updatedAt: string;
  ai: InsightContent;
  edited?: InsightContent;
  /** ファシリテーターが採用したか。自動では、採用されない */
  approved: boolean;
  approvedAt?: string;
}
