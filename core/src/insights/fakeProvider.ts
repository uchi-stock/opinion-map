import type { InsightProvider, InsightRequest } from "./types.js";

/** テストとデモ用。本物のLLMではなく、入力の件数から固定の案を返す */
export class FakeInsightProvider implements InsightProvider {
  readonly name = "fake";
  /** テストから出力を差し替える */
  output: unknown;
  failWith: string | undefined;
  readonly requests: InsightRequest[] = [];

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
}
