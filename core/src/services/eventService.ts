import type { EventRecord } from "../domain/types.js";
import type { EventInput, EventPatch } from "../domain/validation.js";
import { badRequest, notFound } from "../lib/errors.js";
import type { ServiceContext } from "./context.js";

export function createEventService(ctx: ServiceContext) {
  return {
    async create(input: EventInput, createdBy?: string): Promise<EventRecord> {
      const at = ctx.now().toISOString();
      const event: EventRecord = {
        id: ctx.newId(),
        name: input.name,
        description: input.description,
        status: "draft",
        ...(createdBy ? { createdBy } : {}),
        createdAt: at,
        updatedAt: at,
      };
      await ctx.repos.events.create(event);
      return event;
    },

    list(): Promise<EventRecord[]> {
      return ctx.repos.events.list();
    },

    async get(id: string): Promise<EventRecord> {
      const event = await ctx.repos.events.get(id);
      if (!event) throw notFound("イベント");
      return event;
    },

    async update(id: string, patch: EventPatch): Promise<EventRecord> {
      const event = await this.get(id);
      const { currentSessionId, openSessionIds, ...rest } = patch;
      const next: EventRecord = { ...event, ...rest, updatedAt: ctx.now().toISOString() };
      // 開くテーマは、このイベントの、下書きでないセッションだけ
      const checkOpenable = async (sessionIds: string[]) => {
        for (const sessionId of sessionIds) {
          const session = await ctx.repos.sessions.get(sessionId);
          if (!session || session.eventId !== id) {
            throw badRequest("invalid_open_sessions", "このイベントのテーマを指定してください");
          }
          if (session.status === "draft") {
            throw badRequest("invalid_open_sessions", "下書きのテーマは、開けません");
          }
        }
      };
      if (openSessionIds !== undefined) {
        if (openSessionIds !== null) await checkOpenable(openSessionIds);
        delete next.currentSessionId;
        if (openSessionIds === null) delete next.openSessionIds;
        else next.openSessionIds = openSessionIds;
      } else if (currentSessionId !== undefined) {
        // 古い指定。そのテーマ1つだけを開く
        if (currentSessionId !== null) await checkOpenable([currentSessionId]);
        delete next.currentSessionId;
        if (currentSessionId === null) delete next.openSessionIds;
        else next.openSessionIds = [currentSessionId];
      }
      await ctx.repos.events.update(next);
      return next;
    },
  };
}
export type EventService = ReturnType<typeof createEventService>;
