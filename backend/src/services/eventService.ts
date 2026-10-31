import type { EventRecord } from "../domain/types.js";
import type { EventInput, EventPatch } from "../domain/validation.js";
import { badRequest, notFound } from "../lib/errors.js";
import type { ServiceContext } from "./context.js";

export function createEventService(ctx: ServiceContext) {
  return {
    async create(input: EventInput): Promise<EventRecord> {
      const at = ctx.now().toISOString();
      const event: EventRecord = {
        id: ctx.newId(),
        name: input.name,
        description: input.description,
        status: "draft",
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
      const { currentSessionId, ...rest } = patch;
      const next: EventRecord = { ...event, ...rest, updatedAt: ctx.now().toISOString() };
      if (currentSessionId === null) {
        delete next.currentSessionId;
      } else if (currentSessionId !== undefined) {
        // いまのテーマは、このイベントの、下書きでないセッションだけ
        const session = await ctx.repos.sessions.get(currentSessionId);
        if (!session || session.eventId !== id) {
          throw badRequest("invalid_current_session", "このイベントのテーマを指定してください");
        }
        if (session.status === "draft") {
          throw badRequest("invalid_current_session", "下書きのテーマは、いまのテーマにできません");
        }
        next.currentSessionId = currentSessionId;
      }
      await ctx.repos.events.update(next);
      return next;
    },
  };
}
export type EventService = ReturnType<typeof createEventService>;
