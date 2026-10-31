import type { SessionNotes, SessionRecord } from "../domain/types.js";
import type { NotesInput, SessionInput, SessionPatch } from "../domain/validation.js";
import { notFound } from "../lib/errors.js";
import type { ServiceContext } from "./context.js";

export function createSessionService(ctx: ServiceContext) {
  return {
    async create(eventId: string, input: SessionInput): Promise<SessionRecord> {
      const event = await ctx.repos.events.get(eventId);
      if (!event) throw notFound("イベント");
      const at = ctx.now().toISOString();
      const session: SessionRecord = {
        id: ctx.newId(),
        eventId,
        title: input.title,
        prompt: input.prompt,
        format: input.format,
        status: "draft",
        showOpinionsToParticipants: input.showOpinionsToParticipants,
        ...(input.timerSeconds === undefined ? {} : { timerSeconds: input.timerSeconds }),
        createdAt: at,
        updatedAt: at,
      };
      await ctx.repos.sessions.create(session);
      return session;
    },

    async listByEvent(eventId: string): Promise<SessionRecord[]> {
      const event = await ctx.repos.events.get(eventId);
      if (!event) throw notFound("イベント");
      return ctx.repos.sessions.listByEvent(eventId);
    },

    async get(id: string): Promise<SessionRecord> {
      const session = await ctx.repos.sessions.get(id);
      if (!session) throw notFound("テーマ");
      return session;
    },

    /** 議論の記録を保存する。同時に書いたときは、後の保存が残る(更新日時で分かる) */
    async saveNotes(id: string, input: NotesInput): Promise<SessionRecord> {
      const session = await this.get(id);
      const at = ctx.now().toISOString();
      const notes: SessionNotes = {
        conclusion: input.conclusion,
        nextActions: input.nextActions,
        openQuestions: input.openQuestions,
        updatedAt: at,
      };
      const next: SessionRecord = { ...session, notes, notesPublished: input.published, updatedAt: at };
      await ctx.repos.sessions.update(next);
      return next;
    },

    /**
     * イベントの全テーマの記録。運営者は、すべて(未公開を含む)。
     * 参加者は、公開済みのものだけで、下書きのイベント・テーマは存在しないものとして扱う
     */
    async listNotes(eventId: string, forAdmin: boolean): Promise<
      { sessionId: string; title: string; published: boolean; notes: SessionNotes }[]
    > {
      const event = await ctx.repos.events.get(eventId);
      if (!event || (!forAdmin && event.status === "draft")) throw notFound("イベント");
      const sessions = await ctx.repos.sessions.listByEvent(eventId);
      return sessions
        .filter((s) => s.notes !== undefined && (forAdmin || (s.notesPublished === true && s.status !== "draft")))
        .map((s) => ({ sessionId: s.id, title: s.title, published: s.notesPublished === true, notes: s.notes! }));
    },

    async update(id: string, patch: SessionPatch): Promise<SessionRecord> {
      const session = await this.get(id);
      const { timerSeconds, ...rest } = patch;
      const now = ctx.now();
      const next: SessionRecord = { ...session, ...rest, updatedAt: now.toISOString() };
      if (timerSeconds === null) delete next.timerSeconds;
      else if (timerSeconds !== undefined) next.timerSeconds = timerSeconds;
      // 公開中にした時点で、締め切りを決める。公開中でなくなれば、締め切りは消す
      if (next.status !== "active") delete next.deadlineAt;
      else if (session.status !== "active" || timerSeconds !== undefined) {
        if (next.timerSeconds === undefined) delete next.deadlineAt;
        else if (session.status !== "active" || session.deadlineAt === undefined) {
          next.deadlineAt = new Date(now.getTime() + next.timerSeconds * 1000).toISOString();
        }
      }
      await ctx.repos.sessions.update(next);
      return next;
    },
  };
}
export type SessionService = ReturnType<typeof createSessionService>;
