import type { InsightProvider, InsightRequest, TranscriptRequest } from "./types.js";

/** テストとデモ用。本物のLLMではなく、入力の件数から固定の案を返す */
export class FakeInsightProvider implements InsightProvider {
  readonly name = "fake";
  /** テストから出力を差し替える */
  output: unknown;
  failWith: string | undefined;
  readonly requests: InsightRequest[] = [];
  readonly transcriptRequests: TranscriptRequest[] = [];
  /** extractOpinions の出力を差し替える */
  extractOutput: unknown;

  async generate(request: InsightRequest): Promise<unknown> {
    this.requests.push(request);
    if (this.failWith) throw new Error(this.failWith);
    if (this.output !== undefined) return this.output;
    return {
      commonPoints: [`「${request.clusterTitle}」について、${request.opinions.length}件の意見が出ています（デモ用の案です）`],
      differences: request.opinions.length > 1 ? ["意見によって、重みを置く点が違うかもしれません（デモ用の案です）"] : [],
      premiseDifferences: [],
      questions: ["この話題で、まだ出ていない立場はありますか？（デモ用の案です）"],
    };
  }

  /** 文を区切って、先頭から最大5件を、そのまま候補にする(本物のAIではない) */
  async extractOpinions(request: TranscriptRequest): Promise<unknown> {
    this.transcriptRequests.push(request);
    if (this.failWith) throw new Error(this.failWith);
    if (this.extractOutput !== undefined) return this.extractOutput;
    const sentences = request.text
      .split(/[。\n]/)
      .map((t) => t.trim())
      .filter((t) => t !== "")
      .slice(0, 5);
    return {
      opinions: sentences.map((body) => ({
        body,
        kind: body.endsWith("？") || body.endsWith("?") ? "question" : "idea",
      })),
    };
  }
}
