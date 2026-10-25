import type { AnalysisRunRecord } from "../analysis/types.js";
import type { InsightRecord } from "../insights/types.js";
import type { EventRecord, OperatorTokenRecord, OpinionRecord, SessionRecord } from "../domain/types.js";
import type { Repositories } from "./types.js";

/** テストとローカル開発用。プロセスが終わると消える */
export function createInMemoryRepositories(): Repositories {
  const events = new Map<string, EventRecord>();
  const sessions = new Map<string, SessionRecord>();
  const opinions = new Map<string, OpinionRecord>();
  const bySubmission = new Map<string, string>();
  const analyses = new Map<string, AnalysisRunRecord>();
  const operatorTokens = new Map<string, OperatorTokenRecord>();
  const insights = new Map<string, InsightRecord>();

  return {
    events: {
      async create(event) {
        events.set(event.id, { ...event });
      },
      async get(id) {
        const e = events.get(id);
        return e ? { ...e } : undefined;
      },
      async list() {
        return [...events.values()].map((e) => ({ ...e })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
      async update(event) {
        events.set(event.id, { ...event });
      },
    },
    sessions: {
      async create(session) {
        sessions.set(session.id, { ...session });
      },
      async get(id) {
        const s = sessions.get(id);
        return s ? { ...s } : undefined;
      },
      async listByEvent(eventId) {
        return [...sessions.values()]
          .filter((s) => s.eventId === eventId)
          .map((s) => ({ ...s }))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
      async update(session) {
        sessions.set(session.id, { ...session });
      },
    },
    opinions: {
      async createIfAbsent(opinion) {
        const key = `${opinion.sessionId}#${opinion.submissionId}`;
        const existingId = bySubmission.get(key);
        if (existingId) {
          return { opinion: { ...opinions.get(existingId)! }, created: false };
        }
        opinions.set(opinion.id, { ...opinion });
        bySubmission.set(key, opinion.id);
        return { opinion: { ...opinion }, created: true };
      },
      async findBySubmission(sessionId, submissionId) {
        const id = bySubmission.get(`${sessionId}#${submissionId}`);
        return id ? { ...opinions.get(id)! } : undefined;
      },
      async get(id) {
        const o = opinions.get(id);
        return o ? { ...o } : undefined;
      },
      async update(opinion) {
        opinions.set(opinion.id, { ...opinion });
      },
      async listBySession(sessionId) {
        return [...opinions.values()]
          .filter((o) => o.sessionId === sessionId && o.status === "active")
          .map((o) => ({ ...o }))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
      async listManageableBySession(sessionId) {
        return [...opinions.values()]
          .filter((o) => o.sessionId === sessionId && o.status !== "deleted")
          .map((o) => ({ ...o }))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
      async countCreatedSince(sessionId, sinceIso) {
        return [...opinions.values()].filter((o) => o.sessionId === sessionId && o.createdAt >= sinceIso).length;
      },
    },
    analyses: {
      async createIfNoActive(run) {
        const active = [...analyses.values()].find(
          (r) => r.sessionId === run.sessionId && (r.status === "queued" || r.status === "running"),
        );
        if (active) return { run: structuredClone(active), created: false };
        analyses.set(run.id, structuredClone(run));
        return { run: structuredClone(run), created: true };
      },
      async get(id) {
        const r = analyses.get(id);
        return r ? structuredClone(r) : undefined;
      },
      async update(run) {
        analyses.set(run.id, structuredClone(run));
      },
      async listBySession(sessionId) {
        return [...analyses.values()]
          .filter((r) => r.sessionId === sessionId)
          .map((r) => structuredClone(r))
          .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
      },
    },
    operatorTokens: {
      async create(token) {
        operatorTokens.set(token.id, { ...token });
      },
      async get(id) {
        const t = operatorTokens.get(id);
        return t ? { ...t } : undefined;
      },
      async getByHash(tokenHash) {
        const t = [...operatorTokens.values()].find((x) => x.tokenHash === tokenHash);
        return t ? { ...t } : undefined;
      },
      async listByEvent(eventId) {
        return [...operatorTokens.values()]
          .filter((t) => t.eventId === eventId)
          .map((t) => ({ ...t }))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
      async update(token) {
        operatorTokens.set(token.id, { ...token });
      },
    },
    insights: {
      async create(insight) {
        insights.set(insight.id, structuredClone(insight));
      },
      async get(id) {
        const i = insights.get(id);
        return i ? structuredClone(i) : undefined;
      },
      async update(insight) {
        insights.set(insight.id, structuredClone(insight));
      },
      async listByAnalysis(analysisRunId) {
        return [...insights.values()]
          .filter((i) => i.analysisRunId === analysisRunId)
          .map((i) => structuredClone(i))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
    },
  };
}
