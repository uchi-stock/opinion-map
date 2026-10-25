import type { AnalysisRunRecord } from "../analysis/types.js";
import type { EventRecord, OpinionRecord, SessionRecord } from "../domain/types.js";
import type { Repositories } from "./types.js";

/** テストとローカル開発用。プロセスが終わると消える */
export function createInMemoryRepositories(): Repositories {
  const events = new Map<string, EventRecord>();
  const sessions = new Map<string, SessionRecord>();
  const opinions = new Map<string, OpinionRecord>();
  const bySubmission = new Map<string, string>();
  const analyses = new Map<string, AnalysisRunRecord>();

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
      async listBySession(sessionId) {
        return [...opinions.values()]
          .filter((o) => o.sessionId === sessionId && o.status === "active")
          .map((o) => ({ ...o }))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
  };
}
