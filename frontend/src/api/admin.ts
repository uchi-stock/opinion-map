import { request } from "./client.ts";
import type {
  AnalysisRun,
  EventRecord,
  EventStatus,
  Insight,
  InsightContent,
  OperatorToken,
  AdminOpinionList,
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
    listOpinions(sessionId: string): Promise<AdminOpinionList> {
      return send("GET", `/sessions/${enc(sessionId)}/opinions`);
    },
    async listAnalyses(sessionId: string): Promise<AnalysisRun[]> {
      return (await send<{ analyses: AnalysisRun[] }>("GET", `/sessions/${enc(sessionId)}/analyses`)).analyses;
    },
    moderateOpinion(id: string, status: "active" | "hidden" | "deleted"): Promise<{ id: string; status: string }> {
      return send("POST", `/opinions/${enc(id)}/moderation`, { status });
    },
    async listInsights(analysisId: string): Promise<Insight[]> {
      return (await send<{ insights: Insight[] }>("GET", `/analyses/${enc(analysisId)}/insights`)).insights;
    },
    generateInsight(analysisId: string, clusterId: string): Promise<Insight> {
      return send("POST", `/analyses/${enc(analysisId)}/clusters/${enc(clusterId)}/insights`);
    },
    updateInsight(id: string, patch: { edited?: InsightContent; approved?: boolean }): Promise<Insight> {
      return send("PATCH", `/insights/${enc(id)}`, patch);
    },
    async listOperatorTokens(eventId: string): Promise<OperatorToken[]> {
      return (await send<{ tokens: OperatorToken[] }>("GET", `/events/${enc(eventId)}/operator-tokens`)).tokens;
    },
    issueOperatorToken(eventId: string, label: string): Promise<OperatorToken & { token: string }> {
      return send("POST", `/events/${enc(eventId)}/operator-tokens`, { label });
    },
    revokeOperatorToken(id: string): Promise<OperatorToken> {
      return send("POST", `/operator-tokens/${enc(id)}/revoke`);
    },
    startAnalysis(sessionId: string): Promise<AnalysisRun> {
      return send("POST", `/sessions/${enc(sessionId)}/analyses`);
    },
    getAnalysis(id: string): Promise<AnalysisRun> {
      return send("GET", `/analyses/${enc(id)}`);
    },
    retryAnalysis(id: string): Promise<AnalysisRun> {
      return send("POST", `/analyses/${enc(id)}/retry`);
    },
  };
}
export type AdminApi = ReturnType<typeof createAdminApi>;
