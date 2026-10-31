import type { InsightContent } from "../insights/types.js";
import { notFound } from "../lib/errors.js";
import type { ServiceContext } from "./context.js";

/** 参加者に見せる要約。運営者が公開したものだけで、AIの出力を、許可した項目だけ返す */
export interface PublicSummary {
  published: true;
  overview: string;
  completedAt?: string;
  /** 分析のあとに増えた投稿の数。要約が古いかどうかの目安 */
  newOpinionCount: number;
  clusters: {
    id: string;
    level: number;
    parentId: string | null;
    title: string;
    summary: string;
    opinionCount: number;
    /** 元の投稿へたどるためのID。意見を参加者に見せない設定のときは、返さない */
    opinionIds?: string[];
  }[];
  unclassifiedCount: number;
  unclassifiedOpinionIds?: string[];
  /** 運営者が採用した案だけ。編集があれば、編集後 */
  insights: { clusterId: string; content: InsightContent }[];
}

export function createSummaryService(ctx: ServiceContext) {
  return {
    /** 公開されていなければ、要約の内容は返さない(公開の有無だけ) */
    async getPublished(sessionId: string): Promise<{ published: false } | PublicSummary> {
      const session = await ctx.repos.sessions.get(sessionId);
      if (!session) throw notFound("テーマ");
      const event = await ctx.repos.events.get(session.eventId);
      if (!event || event.status === "draft" || session.status === "draft") throw notFound("テーマ");
      if (session.summaryPublished !== true) return { published: false };
      const runs = await ctx.repos.analyses.listBySession(sessionId);
      const run = [...runs].reverse().find((r) => r.status === "succeeded" && r.result);
      if (!run?.result) return { published: false };
      const showOpinions = session.showOpinionsToParticipants;
      const analyzed = new Set(run.input.opinionIds);
      const current = await ctx.repos.opinions.listBySession(sessionId);
      const insights = (await ctx.repos.insights.listByAnalysis(run.id)).filter((i) => i.approved);
      return {
        published: true,
        overview: run.result.overview,
        ...(run.completedAt ? { completedAt: run.completedAt } : {}),
        newOpinionCount: current.filter((o) => !analyzed.has(o.id)).length,
        clusters: run.result.clusters.map((c) => ({
          id: c.id,
          level: c.level,
          parentId: c.parentId,
          title: c.title,
          summary: c.summary,
          opinionCount: c.opinionIds.length,
          ...(showOpinions ? { opinionIds: c.opinionIds } : {}),
        })),
        unclassifiedCount: run.result.unclassifiedOpinionIds.length,
        ...(showOpinions ? { unclassifiedOpinionIds: run.result.unclassifiedOpinionIds } : {}),
        insights: insights.map((i) => ({ clusterId: i.clusterId, content: i.edited ?? i.ai })),
      };
    },
  };
}
