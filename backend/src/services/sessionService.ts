import type { SessionRecord } from "../domain/types.js";
import type { SessionInput, SessionPatch } from "../domain/validation.js";
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
      if (!session) throw notFound("セッション");
      return session;
    },

    async update(id: string, patch: SessionPatch): Promise<SessionRecord> {
      const session = await this.get(id);
      const next: SessionRecord = { ...session, ...patch, updatedAt: ctx.now().toISOString() };
      await ctx.repos.sessions.update(next);
      return next;
    },
  };
}
export type SessionService = ReturnType<typeof createSessionService>;
