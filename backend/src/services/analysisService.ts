import { hashInput, validateResult, AnalysisOutputError } from "../analysis/validation.js";
import type {
  AnalysisOpinion,
  AnalysisProvider,
  AnalysisResult,
  AnalysisRunRecord,
  AnalysisStatus,
} from "../analysis/types.js";
import { AppError, badRequest, conflict, notFound } from "../lib/errors.js";
import type { ServiceContext } from "./context.js";
import type { UsageService } from "./usageService.js";

/** 分析の実行の上限時間。これを超えて終わらない実行は、失敗として扱う */
export const DEFAULT_ANALYSIS_TIMEOUT_MS = 30 * 60 * 1000;

export interface PublicAnalysisRun {
  id: string;
  sessionId: string;
  status: AnalysisStatus;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  providerName: string;
  retryOf?: string;
  /** 分析の対象にした投稿の数 */
  inputCount: number;
  inputHash: string;
  /** 実行を始めたあとに増えた投稿の数 */
  newOpinionCount: number;
  error?: { code: string; summary: string };
  /** 完了した実行だけが、結果を持つ。一覧では含めない */
  result?: AnalysisResult;
}

/** エラーの説明を、短くする。投稿の本文が含まれないよう、長さを抑える */
function summarize(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 300 ? `${message.slice(0, 300)}…` : message;
}

export function createAnalysisService(
  ctx: ServiceContext,
  provider: AnalysisProvider,
  options: { timeoutMs?: number; usage?: UsageService } = {},
) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_ANALYSIS_TIMEOUT_MS;

  async function toPublic(run: AnalysisRunRecord, includeResult: boolean): Promise<PublicAnalysisRun> {
    const current = await ctx.repos.opinions.listBySession(run.sessionId);
    const inSnapshot = new Set(run.input.opinions.map((o) => o.id));
    const publicRun: PublicAnalysisRun = {
      id: run.id,
      sessionId: run.sessionId,
      status: run.status,
      requestedAt: run.requestedAt,
      providerName: run.providerName,
      inputCount: run.input.opinions.length,
      inputHash: run.input.hash,
      newOpinionCount: current.filter((o) => !inSnapshot.has(o.id)).length,
    };
    if (run.startedAt) publicRun.startedAt = run.startedAt;
    if (run.completedAt) publicRun.completedAt = run.completedAt;
    if (run.retryOf) publicRun.retryOf = run.retryOf;
    if (run.error) publicRun.error = run.error;
    if (includeResult && run.result) publicRun.result = run.result;
    return publicRun;
  }

  /** 実行を作り、分析基盤で始める。始められなくても、入力のスナップショットは残す */
  async function launch(
    sessionId: string,
    question: string,
    opinions: AnalysisOpinion[],
    retryOf?: string,
  ): Promise<AnalysisRunRecord> {
    // 課金が発生する前に、1日の上限を確かめる。実行を作る前の確認は読むだけで、使うのは作れたあと
    const session = await ctx.repos.sessions.get(sessionId);
    const eventId = session?.eventId;
    if (options.usage && eventId) await options.usage.assertAvailable("analysis", eventId);
    const at = ctx.now().toISOString();
    const queued: AnalysisRunRecord = {
      id: ctx.newId(),
      sessionId,
      status: "queued",
      requestedAt: at,
      providerName: provider.name,
      input: { opinions, hash: await hashInput(opinions) },
      ...(retryOf ? { retryOf } : {}),
    };
    const created = await ctx.repos.analyses.createIfNoActive(queued);
    if (!created.created) {
      throw conflict("analysis_in_progress", "このセッションでは、すでに分析を実行中です");
    }
    if (options.usage && eventId) {
      try {
        await options.usage.consume("analysis", eventId);
      } catch (e) {
        // 並行した実行で上限に達した場合。始めずに、失敗として記録する
        await ctx.repos.analyses.update({
          ...queued,
          status: "failed",
          completedAt: ctx.now().toISOString(),
          error: { code: "daily_limit", summary: "1日の上限に達したため、始めませんでした" },
        });
        throw e;
      }
    }
    try {
      const { providerRunId } = await provider.start({ runId: queued.id, sessionId, question, opinions });
      const running: AnalysisRunRecord = {
        ...queued,
        status: "running",
        startedAt: ctx.now().toISOString(),
        providerRunId,
      };
      await ctx.repos.analyses.update(running);
      return running;
    } catch (e) {
      const failed: AnalysisRunRecord = {
        ...queued,
        status: "failed",
        completedAt: ctx.now().toISOString(),
        error: { code: "provider_start_failed", summary: summarize(e) },
      };
      await ctx.repos.analyses.update(failed);
      return failed;
    }
  }

  async function load(id: string): Promise<AnalysisRunRecord> {
    const run = await ctx.repos.analyses.get(id);
    if (!run) throw notFound("分析");
    return run;
  }

  async function fail(run: AnalysisRunRecord, code: string, summary: string): Promise<AnalysisRunRecord> {
    const failed: AnalysisRunRecord = {
      ...run,
      status: "failed",
      completedAt: ctx.now().toISOString(),
      error: { code, summary },
    };
    await ctx.repos.analyses.update(failed);
    return failed;
  }

  return {
    /** 分析を始める。そのときの投稿を固定して記録する */
    async start(sessionId: string): Promise<PublicAnalysisRun> {
      const session = await ctx.repos.sessions.get(sessionId);
      if (!session) throw notFound("セッション");
      const opinions = (await ctx.repos.opinions.listBySession(sessionId)).map<AnalysisOpinion>((o) => ({
        id: o.id,
        body: o.body,
        kind: o.kind,
      }));
      if (opinions.length === 0) throw badRequest("no_opinions", "分析できる投稿がありません");
      return toPublic(await launch(sessionId, session.prompt, opinions), false);
    },

    /** 失敗した実行を、同じ入力で、新しい実行として、もう一度行う */
    async retry(runId: string): Promise<PublicAnalysisRun> {
      const failed = await load(runId);
      if (failed.status !== "failed") throw conflict("not_failed", "失敗した分析だけを、再試行できます");
      const session = await ctx.repos.sessions.get(failed.sessionId);
      if (!session) throw notFound("セッション");
      return toPublic(await launch(failed.sessionId, session.prompt, failed.input.opinions, failed.id), false);
    },

    /** 実行を返す。実行中なら、分析基盤に状態を確認し、終わっていれば結果を取り込む */
    async get(runId: string): Promise<PublicAnalysisRun> {
      let run = await load(runId);
      if (run.status === "running" && run.providerRunId) {
        const startedAt = run.startedAt ? Date.parse(run.startedAt) : ctx.now().getTime();
        let state;
        try {
          state = await provider.poll(run.providerRunId);
        } catch (e) {
          // 通信の失敗では、実行の状態を変えない。分析基盤では、続いているかもしれない
          throw new AppError(502, "provider_unreachable", `分析基盤に接続できません: ${summarize(e)}`);
        }
        if (state.status === "failed") {
          run = await fail(run, state.errorCode, state.errorSummary);
        } else if (state.status === "succeeded") {
          try {
            const raw = await provider.fetchResult(run.providerRunId, run.input.opinions);
            const result = validateResult(raw, run.input.opinions.map((o) => o.id));
            run = { ...run, status: "succeeded", completedAt: ctx.now().toISOString(), result };
            await ctx.repos.analyses.update(run);
          } catch (e) {
            if (e instanceof AnalysisOutputError) run = await fail(run, "invalid_output", e.message);
            else throw new AppError(502, "provider_unreachable", `結果を取得できません: ${summarize(e)}`);
          }
        } else if (ctx.now().getTime() - startedAt > timeoutMs) {
          run = await fail(run, "timeout", "分析が、上限の時間内に終わりませんでした");
        }
      }
      return toPublic(run, true);
    },

    async list(sessionId: string): Promise<PublicAnalysisRun[]> {
      const session = await ctx.repos.sessions.get(sessionId);
      if (!session) throw notFound("セッション");
      const runs = await ctx.repos.analyses.listBySession(sessionId);
      return Promise.all(runs.map((r) => toPublic(r, false)));
    },
  };
}
export type AnalysisService = ReturnType<typeof createAnalysisService>;
