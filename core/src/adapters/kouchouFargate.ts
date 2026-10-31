import type {
  AnalysisOpinion,
  AnalysisProvider,
  AnalysisRequest,
  ProviderRunState,
  RawAnalysisResult,
} from "../analysis/types.js";
import { clusterCounts, parseKouchouResult } from "./kouchouAi.js";

/**
 * 広聴AIを、分析1回ごとに、Fargateのタスクとして実行する分析基盤。
 *
 * 流れ:
 * 1. 入力(CSV)と設定を S3 に置く
 * 2. Fargate のタスクを1つ起動する。タスクは、広聴AIの CLI(kouchou-analyze)を実行し、結果を S3 に置いて終わる
 * 3. 結果(result.json)か、失敗(error.json)が S3 に現れるのを待つ。タスクが結果なしに止まった場合は、失敗とする
 *
 * タスクにはインターネットからの入口がない。広聴AIは改造せず、既定のプロンプトのまま動かす。
 */
export interface RunnerPort {
  putObject(key: string, body: string): Promise<void>;
  /** なければ undefined */
  getObject(key: string): Promise<string | undefined>;
  deleteObjects(keys: string[]): Promise<void>;
  /** タスクを起動して、そのARNを返す。env は、タスクの環境変数に足す */
  runTask(env: Record<string, string>): Promise<string>;
  describeTask(taskArn: string): Promise<{ lastStatus: string; stopCode?: string; stoppedReason?: string; exitCode?: number }>;
}

export interface KouchouFargateOptions {
  port: RunnerPort;
  /** S3 のキーの接頭辞(末尾の / なし)。実行ごとに <prefix>/<runId>/ の下を使う */
  prefix?: string;
  model?: string;
  /** LLMの並列実行数。レート制限に合わせて調整する */
  workers?: number;
}

const DEFAULT_PREFIX = "analysis";
const DEFAULT_MODEL = "gemini-2.5-flash";

/** CSVの1つの欄。カンマ・引用符・改行を含むときは、引用符で囲む */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** 広聴AIの入力のCSV。見出しは comment-id と comment-body */
export function toCsv(opinions: readonly AnalysisOpinion[]): string {
  const rows = opinions.map((o) => `${csvField(o.id)},${csvField(o.body)}`);
  return ["comment-id,comment-body", ...rows].join("\n") + "\n";
}

/** providerRunId は「S3の接頭辞|タスクARN」の形にして、状態の確認に必要な情報を持たせる */
function split(providerRunId: string): { prefix: string; taskArn: string } {
  const i = providerRunId.indexOf("|");
  return { prefix: providerRunId.slice(0, i), taskArn: providerRunId.slice(i + 1) };
}

export class KouchouFargateProvider implements AnalysisProvider {
  readonly name = "kouchou-ai-fargate";
  private readonly port: RunnerPort;
  private readonly prefix: string;
  private readonly model: string;
  private readonly workers: number;

  constructor(options: KouchouFargateOptions) {
    this.port = options.port;
    this.prefix = options.prefix ?? DEFAULT_PREFIX;
    this.model = options.model ?? DEFAULT_MODEL;
    this.workers = options.workers ?? 3;
  }

  async start(request: AnalysisRequest): Promise<{ providerRunId: string }> {
    const dir = `${this.prefix}/${request.runId}`;
    const config = {
      name: `opinion-map ${request.runId}`,
      question: request.question,
      input: "input",
      model: this.model,
      provider: "gemini",
      is_embedded_at_local: false,
      extraction: { workers: this.workers, limit: request.opinions.length },
      hierarchical_clustering: { cluster_nums: clusterCounts(request.opinions.length) },
    };
    await this.port.putObject(`${dir}/input.csv`, toCsv(request.opinions));
    await this.port.putObject(`${dir}/config.json`, JSON.stringify(config));
    const taskArn = await this.port.runTask({ ANALYSIS_PREFIX: dir });
    return { providerRunId: `${dir}|${taskArn}` };
  }

  async poll(providerRunId: string): Promise<ProviderRunState> {
    const { prefix, taskArn } = split(providerRunId);
    if ((await this.port.getObject(`${prefix}/result.json`)) !== undefined) return { status: "succeeded" };

    const failure = await this.port.getObject(`${prefix}/error.json`);
    if (failure !== undefined) {
      let summary = "広聴AIの分析が失敗しました";
      try {
        const parsed = JSON.parse(failure) as { summary?: unknown };
        if (typeof parsed.summary === "string" && parsed.summary !== "") summary = parsed.summary;
      } catch {
        // 読めなくても、失敗として扱う
      }
      return { status: "failed", errorCode: "runner_failed", errorSummary: summary.slice(0, 300) };
    }

    const task = await this.port.describeTask(taskArn);
    if (task.lastStatus === "STOPPED") {
      // 結果もエラーも書かずに止まった(イメージが取れない、メモリ不足、強制終了など)。
      // 止まる直前に書かれた結果を見逃さないよう、もう一度だけ確かめる
      if ((await this.port.getObject(`${prefix}/result.json`)) !== undefined) return { status: "succeeded" };
      const reason = [task.stopCode, task.stoppedReason, task.exitCode !== undefined ? `exit ${task.exitCode}` : undefined]
        .filter((v): v is string => typeof v === "string" && v !== "")
        .join(" / ");
      return {
        status: "failed",
        errorCode: "task_stopped",
        errorSummary: `分析のタスクが、結果を出さずに止まりました${reason ? `: ${reason}` : ""}`.slice(0, 300),
      };
    }
    return { status: "running" };
  }

  async fetchResult(providerRunId: string, _opinions: readonly AnalysisOpinion[]): Promise<RawAnalysisResult> {
    const { prefix } = split(providerRunId);
    const raw = await this.port.getObject(`${prefix}/result.json`);
    if (raw === undefined) throw new Error("分析の結果が見つかりません");
    const result = parseKouchouResult(JSON.parse(raw));
    // 投稿の本文を含む入力と結果は、取り込んだら消す(取り込み済みの結果は、アプリのDBにある)
    await this.port.deleteObjects([`${prefix}/input.csv`, `${prefix}/config.json`, `${prefix}/result.json`, `${prefix}/error.json`]).catch(() => undefined);
    return result;
  }
}
