import { AnalysisOutputError } from "../analysis/validation.js";
import type {
  AnalysisCluster,
  AnalysisOpinion,
  AnalysisProvider,
  AnalysisRequest,
  ProviderRunState,
  RawAnalysisResult,
} from "../analysis/types.js";

/**
 * 広聴AIに渡すプロンプト。広聴AIのAPIは、4つとも必須で、空にしても既定には戻らない。
 * 広聴AIの既定の文面は、広聴AIのライセンス（AGPL-3.0）のコードにある。
 * そのため、ここにはコピーせず、呼び出す側が、設定として渡す。
 */
export interface KouchouPrompts {
  extraction: string;
  initialLabelling: string;
  mergeLabelling: string;
  overview: string;
}

export interface KouchouAiOptions {
  baseUrl: string;
  /** 広聴AIの管理用APIキー（x-api-key） */
  adminApiKey: string;
  /** 利用者のLLMのAPIキー。広聴AI側で設定済みなら、不要（x-user-api-key） */
  llmApiKey?: string;
  /** LLMのプロバイダー（openai, gemini など） */
  llmProvider: string;
  model: string;
  embeddingModel?: string;
  prompts: KouchouPrompts;
  /** LLMの並列実行数。レート制限に合わせて調整する */
  workers?: number;
  fetch?: typeof fetch;
}

/** 広聴AIの推奨に合わせて、意見の数から、階層ごとのクラスタ数を決める（立方根と、その2乗） */
export function clusterCounts(opinionCount: number): number[] {
  if (opinionCount < 6) return [2];
  const first = Math.min(10, Math.max(2, Math.round(Math.cbrt(opinionCount))));
  return [first, first * first];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * 広聴AIの結果（hierarchical_result.json）を、アプリの形に直す。
 * - 階層0（全体）は除く
 * - 各クラスタに属する元の投稿のIDは、argumentsの cluster_ids と comment_id から求める
 */
export function parseKouchouResult(json: unknown): RawAnalysisResult {
  if (!isRecord(json)) throw new AnalysisOutputError("広聴AIの結果がオブジェクトではありません");
  const { clusters, arguments: args, overview } = json;
  if (!Array.isArray(clusters) || !Array.isArray(args)) {
    throw new AnalysisOutputError("広聴AIの結果に、clusters または arguments がありません");
  }

  const byCluster = new Map<string, Set<string>>();
  for (const arg of args) {
    if (!isRecord(arg)) throw new AnalysisOutputError("arguments の要素がオブジェクトではありません");
    // CSV由来の数字だけのIDは、数値として返ることがある
    const rawCommentId = arg["comment_id"];
    const commentId = typeof rawCommentId === "number" ? String(rawCommentId) : rawCommentId;
    const clusterIds = arg["cluster_ids"];
    if (typeof commentId !== "string" || commentId === "" || !Array.isArray(clusterIds)) continue;
    for (const clusterId of clusterIds) {
      if (typeof clusterId !== "string") continue;
      const set = byCluster.get(clusterId) ?? new Set<string>();
      set.add(commentId);
      byCluster.set(clusterId, set);
    }
  }

  const result: AnalysisCluster[] = [];
  for (const c of clusters) {
    if (!isRecord(c)) throw new AnalysisOutputError("clusters の要素がオブジェクトではありません");
    const level = c["level"];
    if (level === 0) continue;
    const id = c["id"];
    if (typeof id !== "string" || typeof level !== "number") {
      throw new AnalysisOutputError("クラスタの id または level が正しくありません");
    }
    const parent = c["parent"];
    result.push({
      id,
      level,
      parentId: level === 1 ? null : typeof parent === "string" ? parent : null,
      title: typeof c["label"] === "string" ? c["label"] : "",
      summary: typeof c["takeaway"] === "string" ? c["takeaway"] : "",
      opinionIds: [...(byCluster.get(id) ?? [])],
    });
  }
  return { overview: typeof overview === "string" ? overview : "", clusters: result };
}

async function describe(response: Response): Promise<string> {
  let detail = "";
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") detail = `: ${body.detail}`;
  } catch {
    // 本文が読めなくても、状態コードだけ伝える
  }
  return `広聴AIがエラーを返しました（HTTP ${response.status}）${detail}`;
}

/** 広聴AIの、HTTP APIを使う、分析基盤 */
export class KouchouAiProvider implements AnalysisProvider {
  readonly name = "kouchou-ai";
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: KouchouAiOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-api-key": this.options.adminApiKey,
    };
    if (this.options.llmApiKey) headers["x-user-api-key"] = this.options.llmApiKey;
    return headers;
  }

  private url(path: string): string {
    return `${this.options.baseUrl.replace(/\/+$/, "")}${path}`;
  }

  /** 広聴AI側のレポートのID。英数字・ハイフン・アンダースコアだけが使える */
  private slugOf(runId: string): string {
    return `opm-${runId.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  }

  async start(request: AnalysisRequest): Promise<{ providerRunId: string }> {
    const slug = this.slugOf(request.runId);
    const { prompts } = this.options;
    const body = {
      input: slug,
      question: request.question,
      intro: "",
      cluster: clusterCounts(request.opinions.length),
      model: this.options.model,
      provider: this.options.llmProvider,
      ...(this.options.embeddingModel ? { embedding_model: this.options.embeddingModel } : {}),
      workers: this.options.workers ?? 3,
      prompt: {
        extraction: prompts.extraction,
        initial_labelling: prompts.initialLabelling,
        merge_labelling: prompts.mergeLabelling,
        overview: prompts.overview,
      },
      comments: request.opinions.map((o) => ({ id: o.id, comment: o.body })),
      inputType: "file",
      is_pubcom: false,
      analysis_mode: "hierarchical",
    };
    const response = await this.fetchImpl(this.url("/admin/reports"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await describe(response));
    return { providerRunId: slug };
  }

  async poll(providerRunId: string): Promise<ProviderRunState> {
    const response = await this.fetchImpl(
      this.url(`/admin/reports/${encodeURIComponent(providerRunId)}/status/step-json`),
      { headers: this.headers() },
    );
    if (!response.ok) throw new Error(await describe(response));
    const status = (await response.json()) as Record<string, unknown>;
    if (status["status"] === "error") {
      const detail = [status["error_message"], status["error_log_excerpt"]]
        .filter((v): v is string => typeof v === "string" && v.length > 0)
        .join(" / ");
      return {
        status: "failed",
        errorCode: "provider_error",
        errorSummary: detail || "広聴AIの分析が失敗しました。詳細は広聴AI側のログを確認してください",
      };
    }
    if (status["status"] === "completed") return { status: "succeeded" };
    return { status: "running" };
  }

  async fetchResult(providerRunId: string, _opinions: readonly AnalysisOpinion[]): Promise<RawAnalysisResult> {
    const response = await this.fetchImpl(this.url(`/admin/reports/${encodeURIComponent(providerRunId)}/json`), {
      headers: this.headers(),
    });
    if (!response.ok) throw new Error(await describe(response));
    return parseKouchouResult(await response.json());
  }
}
