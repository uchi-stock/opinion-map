import type { SessionRecord } from "../domain/types.js";
import type { AnalysisService } from "./analysisService.js";
import type { ServiceContext } from "./context.js";

/**
 * 制限時間が過ぎたテーマを締め切り、AIの分析を始める。
 * 定期実行(1分ごと)から呼ぶ。投稿の受付は、締め切りの時刻を過ぎた時点で、サーバーが止めている。
 * この処理は、状態の後始末と分析の開始だけを行うため、遅れても投稿の取りこぼしは起きない。
 */
export function createTimerService(ctx: ServiceContext, analyses: AnalysisService | undefined) {
  const isExpired = (session: SessionRecord, now: number) =>
    session.status === "active" && session.deadlineAt !== undefined && Date.parse(session.deadlineAt) <= now;

  /** 先に締め切る。分析が失敗しても、受付は止まったままにする */
  async function closeSession(session: SessionRecord): Promise<void> {
    const { deadlineAt: _gone, ...rest } = session;
    await ctx.repos.sessions.update({ ...rest, status: "closed", updatedAt: ctx.now().toISOString() });
  }

  /** 投稿があるときだけ、分析を始める。失敗しても、ほかのテーマの処理を止めない */
  async function startAnalysisIfAny(sessionId: string): Promise<void> {
    if (!analyses) return;
    if ((await ctx.repos.opinions.listBySession(sessionId)).length === 0) return;
    try {
      await analyses.start(sessionId);
    } catch {
      ctx.log("timer_analysis_failed", { sessionId });
    }
  }

  return {
    /** 締め切りを過ぎた、公開中のテーマ。戻り値は、締め切ったテーマの数 */
    async sweep(): Promise<number> {
      const now = ctx.now().getTime();
      let closed = 0;
      for (const event of await ctx.repos.events.list()) {
        if (event.status !== "active") continue;
        for (const session of await ctx.repos.sessions.listByEvent(event.id)) {
          if (!isExpired(session, now)) continue;
          await closeSession(session);
          closed++;
          await startAnalysisIfAny(session.id);
        }
      }
      return closed;
    },
  };
}
export type TimerService = ReturnType<typeof createTimerService>;
