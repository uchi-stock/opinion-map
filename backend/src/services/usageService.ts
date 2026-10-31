import { jstDayKey, nextJstMidnightIso } from "../lib/dayKey.js";
import { AppError } from "../lib/errors.js";
import type { ServiceContext } from "./context.js";

/** AIの利用の種類。どちらも実行のたびに課金が発生する */
export type UsageKind = "analysis" | "insight";

export interface DailyLimits {
  /** 分析(広聴AI + Gemini)の開始。イベントごと・1日あたり */
  analysis: number;
  /** 共通点・相違点・問いの案(Gemini)の生成。イベントごと・1日あたり */
  insight: number;
}

/** 既定の上限。控えめにしてあり、環境変数で変えられる */
export const DEFAULT_DAILY_LIMITS: DailyLimits = { analysis: 10, insight: 100 };

const LABELS: Record<UsageKind, string> = { analysis: "分析", insight: "案の生成" };

export function createUsageService(ctx: ServiceContext, limits: DailyLimits = DEFAULT_DAILY_LIMITS) {
  const scope = (kind: UsageKind, eventId: string) => `${kind}:${eventId}`;
  const tooMany = (kind: UsageKind) =>
    new AppError(
      429,
      "daily_limit",
      `今日の${LABELS[kind]}の上限（${limits[kind]}回）に達しました。日本時間の0時に戻ります。上限は運営の設定で変えられます`,
    );

  return {
    /** 実行の前に、上限を超えていないかだけを確かめる(使わない) */
    async assertAvailable(kind: UsageKind, eventId: string): Promise<void> {
      const used = await ctx.repos.usage.used(scope(kind, eventId), jstDayKey(ctx.now()));
      if (used >= limits[kind]) throw tooMany(kind);
    },

    /** 1回分を使う。上限に達していれば 429。並行して呼ばれても、上限を超えない */
    async consume(kind: UsageKind, eventId: string): Promise<void> {
      const result = await ctx.repos.usage.consume(scope(kind, eventId), jstDayKey(ctx.now()), limits[kind]);
      if (!result.allowed) throw tooMany(kind);
    },

    async summary(eventId: string) {
      const day = jstDayKey(ctx.now());
      const [analysis, insight] = await Promise.all([
        ctx.repos.usage.used(scope("analysis", eventId), day),
        ctx.repos.usage.used(scope("insight", eventId), day),
      ]);
      return {
        day,
        resetsAt: nextJstMidnightIso(ctx.now()),
        analysis: { used: Math.min(analysis, limits.analysis), limit: limits.analysis },
        insight: { used: Math.min(insight, limits.insight), limit: limits.insight },
      };
    },
  };
}
export type UsageService = ReturnType<typeof createUsageService>;
