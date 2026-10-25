import type { EventRecord } from "../domain/types.js";
import type { EventInput, EventPatch } from "../domain/validation.js";
import { notFound } from "../lib/errors.js";
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
      const next: EventRecord = { ...event, ...patch, updatedAt: ctx.now().toISOString() };
      await ctx.repos.events.update(next);
      return next;
    },
  };
}
export type EventService = ReturnType<typeof createEventService>;
