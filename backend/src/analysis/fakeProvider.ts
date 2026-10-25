import type {
  AnalysisOpinion,
  AnalysisProvider,
  AnalysisRequest,
  ProviderRunState,
  RawAnalysisResult,
} from "./types.js";

/**
 * テストとデモ用の分析基盤。投稿の種類ごとに、クラスタを1つ作る。
 * 本物の分析ではない。振る舞いを、テストから操作できる。
 */
export class FakeAnalysisProvider implements AnalysisProvider {
  readonly name = "fake";
  /** 次に poll が返す状態。テストで書き換える */
  nextState: ProviderRunState = { status: "succeeded" };
  /** true なら、start が失敗する */
  failOnStart: string | undefined;
  /** 結果を、テストから差し替える */
  resultOverride: ((opinions: readonly AnalysisOpinion[]) => unknown) | undefined;
  readonly started: AnalysisRequest[] = [];
  private counter = 0;

  async start(request: AnalysisRequest): Promise<{ providerRunId: string }> {
    if (this.failOnStart) throw new Error(this.failOnStart);
    this.started.push(request);
    return { providerRunId: `fake-${++this.counter}` };
  }

  async poll(): Promise<ProviderRunState> {
    return this.nextState;
  }

  async fetchResult(_providerRunId: string, opinions: readonly AnalysisOpinion[]): Promise<RawAnalysisResult> {
    if (this.resultOverride) return this.resultOverride(opinions) as RawAnalysisResult;
    const kinds = [...new Set(opinions.map((o) => o.kind))];
    return {
      overview: "デモ用の分析結果です。",
      clusters: kinds.map((kind, i) => ({
        id: `c${i + 1}`,
        level: 1,
        parentId: null,
        title: `${kind} のまとまり`,
        summary: "種類ごとにまとめた、デモ用のクラスタです。",
        opinionIds: opinions.filter((o) => o.kind === kind).map((o) => o.id),
      })),
    };
  }
}
