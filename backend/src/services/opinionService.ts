import { toPublicOpinion, type EventRecord, type OpinionRecord, type PublicOpinion, type SessionRecord } from "../domain/types.js";
import type { OpinionInput } from "../domain/validation.js";
import { forbidden, notFound } from "../lib/errors.js";
import type { ServiceContext } from "./context.js";

export interface PublicSession {
  id: string;
  title: string;
  prompt: string;
  format: SessionRecord["format"];
  status: SessionRecord["status"];
  eventName: string;
  acceptingOpinions: boolean;
  showOpinions: boolean;
}

function isAccepting(event: EventRecord, session: SessionRecord): boolean {
  return event.status === "active" && session.status === "active";
}

export function createOpinionService(ctx: ServiceContext) {
  /** 下書きのイベント・セッションは、参加者には存在しないものとして扱う */
  async function loadForParticipant(sessionId: string): Promise<{ event: EventRecord; session: SessionRecord }> {
    const session = await ctx.repos.sessions.get(sessionId);
    if (!session) throw notFound("セッション");
    const event = await ctx.repos.events.get(session.eventId);
    if (!event || event.status === "draft" || session.status === "draft") throw notFound("セッション");
    return { event, session };
  }

  return {
    async getPublicSession(sessionId: string): Promise<PublicSession> {
      const { event, session } = await loadForParticipant(sessionId);
      return {
        id: session.id,
        title: session.title,
        prompt: session.prompt,
        format: session.format,
        status: session.status,
        eventName: event.name,
        acceptingOpinions: isAccepting(event, session),
        showOpinions: session.showOpinionsToParticipants,
      };
    },

    /** 同じ送信IDなら、新しく作らず既存の投稿を返す */
    async submit(sessionId: string, input: OpinionInput): Promise<{ opinion: PublicOpinion; created: boolean }> {
      const { event, session } = await loadForParticipant(sessionId);
      if (!isAccepting(event, session)) {
        throw forbidden("not_accepting", "このセッションは、いま投稿を受け付けていません");
      }
      const at = ctx.now().toISOString();
      const record: OpinionRecord = {
        id: ctx.newId(),
        sessionId,
        submissionId: input.submissionId,
        body: input.body,
        kind: input.kind,
        status: "active",
        createdAt: at,
        updatedAt: at,
      };
      const result = await ctx.repos.opinions.createIfAbsent(record);
      return { opinion: toPublicOpinion(result.opinion), created: result.created };
    },

    /** 参加者向けの一覧。非表示の設定なら、空を返す */
    async listForParticipant(sessionId: string): Promise<{ hidden: boolean; opinions: PublicOpinion[] }> {
      const { session } = await loadForParticipant(sessionId);
      if (!session.showOpinionsToParticipants) return { hidden: true, opinions: [] };
      const list = await ctx.repos.opinions.listBySession(sessionId);
      return { hidden: false, opinions: list.map(toPublicOpinion) };
    },

    /** 運営者向けの一覧。設定にかかわらず、すべて返す */
    async listForAdmin(sessionId: string): Promise<PublicOpinion[]> {
      const session = await ctx.repos.sessions.get(sessionId);
      if (!session) throw notFound("セッション");
      const list = await ctx.repos.opinions.listBySession(sessionId);
      return list.map(toPublicOpinion);
    },
  };
}
export type OpinionService = ReturnType<typeof createOpinionService>;
