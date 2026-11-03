import { AppError, badRequest, notFound } from "../lib/errors.js";
import { validateCandidates, type OpinionCandidate } from "../insights/transcriptValidation.js";
import type { InsightProvider } from "../insights/types.js";
import { DEFAULT_OPINION_MAX_LENGTH } from "../domain/validation.js";
import type { ServiceContext } from "./context.js";
import { isAccepting } from "./opinionService.js";
import type { UsageService } from "./usageService.js";

/**
 * 話した内容の文字から、付箋(意見)の候補を作る。
 * 文字は、参加者の端末で作ったもの。音声は、サーバーに送られない。
 * 候補は保存しない。使う人が確かめて、編集してから、ふつうの投稿として送る。
 */
export function createTranscriptService(ctx: ServiceContext, provider: InsightProvider, usage: UsageService, opinionMaxLength = DEFAULT_OPINION_MAX_LENGTH) {
  return {
    async extract(sessionId: string, text: string): Promise<OpinionCandidate[]> {
      const session = await ctx.repos.sessions.get(sessionId);
      if (!session) throw notFound("テーマ");
      const event = await ctx.repos.events.get(session.eventId);
      if (!event) throw notFound("テーマ");
      // 投稿を受け付けていないテーマでは、AIを呼ばない(課金と悪用を避ける)
      if (!isAccepting(event, session, ctx.now())) throw badRequest("not_accepting", "いま投稿を受け付けていないため、付箋の候補を作れません");
      // 課金が発生する前に、1日の上限を使う
      await usage.consume("transcript", session.eventId);
      let raw: unknown;
      try {
        raw = await provider.extractOpinions({ question: session.prompt, text });
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(502, "provider_unreachable", "付箋の候補を作るAIに接続できませんでした");
      }
      return validateCandidates(raw, opinionMaxLength);
    },
  };
}
export type TranscriptService = ReturnType<typeof createTranscriptService>;
