import { badRequest, conflict, notFound } from "../lib/errors.js";
import { AppError } from "../lib/errors.js";
import type { InsightContent, InsightProvider, InsightRecord } from "../insights/types.js";
import { validateInsightContent } from "../insights/validation.js";
import type { ServiceContext } from "./context.js";

export interface InsightPatch {
  edited?: unknown;
  approved?: unknown;
}

export function createInsightService(ctx: ServiceContext, provider: InsightProvider) {
  return {
    /**
     * 完了した分析の、1つのクラスタについて、案を作る。
     * 出力は検証し、正しくなければ保存しない（そのまま見せない）。
     * 作った案は、採用されていない状態で保存する。
     */
    async generate(analysisId: string, clusterId: string): Promise<InsightRecord> {
      const run = await ctx.repos.analyses.get(analysisId);
      if (!run) throw notFound("分析");
      if (run.status !== "succeeded" || !run.result) {
        throw conflict("analysis_not_ready", "完了した分析だけが、対象にできます");
      }
      const cluster = run.result.clusters.find((c) => c.id === clusterId);
      if (!cluster) throw notFound("クラスタ");
      const inCluster = new Set(cluster.opinionIds);
      const opinions = run.input.opinions.filter((o) => inCluster.has(o.id));
      if (opinions.length === 0) throw badRequest("no_opinions", "このクラスタには、投稿がありません");
      const session = await ctx.repos.sessions.get(run.sessionId);
      if (!session) throw notFound("セッション");

      let raw: unknown;
      try {
        raw = await provider.generate({
          question: session.prompt,
          clusterTitle: cluster.title,
          clusterSummary: cluster.summary,
          opinions,
        });
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(502, "provider_unreachable", "案を作るAIに接続できませんでした");
      }
      const ai = validateInsightContent(raw);
      const at = ctx.now().toISOString();
      const record: InsightRecord = {
        id: ctx.newId(),
        analysisRunId: run.id,
        sessionId: run.sessionId,
        clusterId,
        providerName: provider.name,
        createdAt: at,
        updatedAt: at,
        ai,
        approved: false,
      };
      await ctx.repos.insights.create(record);
      return record;
    },

    list(analysisId: string): Promise<InsightRecord[]> {
      return ctx.repos.insights.listByAnalysis(analysisId);
    },

    /** 編集内容と採用の可否を保存する。AIの出力（ai）は、変えない */
    async update(id: string, patch: InsightPatch): Promise<InsightRecord> {
      const current = await ctx.repos.insights.get(id);
      if (!current) throw notFound("案");
      const next: InsightRecord = { ...current, updatedAt: ctx.now().toISOString() };
      if (patch.edited !== undefined) {
        next.edited = validateInsightContent(patch.edited) satisfies InsightContent;
      }
      if (patch.approved !== undefined) {
        if (typeof patch.approved !== "boolean") throw badRequest("invalid_approved", "approved は真偽値で指定してください");
        next.approved = patch.approved;
        if (patch.approved) next.approvedAt = next.updatedAt;
        else delete next.approvedAt;
      }
      await ctx.repos.insights.update(next);
      return next;
    },
  };
}
