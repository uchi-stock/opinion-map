import type { AnalysisService } from "./analysisService.js";
import type { ServiceContext } from "./context.js";

/**
 * 制限時間が過ぎたテーマを締め切り、AIの分析を始める。
 * 定期実行(1分ごと)から呼ぶ。投稿の受付は、締め切りの時刻を過ぎた時点で、サーバーが止めている。
 * この処理は、状態の後始末と分析の開始だけを行うため、遅れても投稿の取りこぼしは起きない。
 */
export function createTimerService(ctx: ServiceContext, analyses: AnalysisService | undefined) {
  return {
    /** 締め切りを過ぎた、公開中のテーマ。戻り値は、締め切ったテーマの数 */
    async sweep(): Promise<number> {
      const now = ctx.now().getTime();
      let closed = 0;
      for (const event of await ctx.repos.events.list()) {
        if (event.status !== "active") continue;
        for (const session of await ctx.repos.sessions.listByEvent(event.id)) {
          if (session.status !== "active" || session.deadlineAt === undefined) continue;
          if (Date.parse(session.deadlineAt) > now) continue;
          // 先に締め切る。分析が失敗しても、受付は止まったままにする
          const { deadlineAt: _gone, ...rest } = session;
          await ctx.repos.sessions.update({ ...rest, status: "closed", updatedAt: ctx.now().toISOString() });
          closed++;
          if (!analyses) continue;
          const opinions = await ctx.repos.opinions.listBySession(session.id);
          if (opinions.length === 0) continue;
          try {
            await analyses.start(session.id);
          } catch (e) {
            ctx.log("timer_analysis_failed", { sessionId: session.id });
            void e;
          }
        }
      }
      return closed;
    },
  };
}
export type TimerService = ReturnType<typeof createTimerService>;
