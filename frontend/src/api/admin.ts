import { request } from "./client.ts";
import type {
  EventRecord,
  EventStatus,
  OpinionList,
  SessionFormat,
  SessionRecord,
  SessionStatus,
} from "./types.ts";

export interface SessionInput {
  title: string;
  prompt: string;
  format: SessionFormat;
  showOpinionsToParticipants: boolean;
}

/** 運営者向けのAPI。すべてのリクエストに、運営者のトークンを付ける */
export function createAdminApi(token: string) {
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const send = <T>(method: string, path: string, body?: unknown) =>
    request<T>(path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const enc = encodeURIComponent;

  return {
    async listEvents(): Promise<EventRecord[]> {
      return (await send<{ events: EventRecord[] }>("GET", "/events")).events;
    },
    createEvent(input: { name: string; description: string }): Promise<EventRecord> {
      return send("POST", "/events", input);
    },
    updateEvent(
      id: string,
      patch: Partial<{ name: string; description: string; status: EventStatus }>,
    ): Promise<EventRecord> {
      return send("PATCH", `/events/${enc(id)}`, patch);
    },
    async listSessions(eventId: string): Promise<SessionRecord[]> {
      return (await send<{ sessions: SessionRecord[] }>("GET", `/events/${enc(eventId)}/sessions`)).sessions;
    },
    createSession(eventId: string, input: SessionInput): Promise<SessionRecord> {
      return send("POST", `/events/${enc(eventId)}/sessions`, input);
    },
    updateSession(
      id: string,
      patch: Partial<SessionInput & { status: SessionStatus }>,
    ): Promise<SessionRecord> {
      return send("PATCH", `/sessions/${enc(id)}`, patch);
    },
    listOpinions(sessionId: string): Promise<OpinionList> {
      return send("GET", `/sessions/${enc(sessionId)}/opinions`);
    },
  };
}
export type AdminApi = ReturnType<typeof createAdminApi>;
