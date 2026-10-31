import { inputOpinionIds, type AnalysisRunRecord, type AnalysisRunSummary } from "../analysis/types.js";
import type { InsightRecord } from "../insights/types.js";
import type { AdminRecord, ProposalRecord, ReactionRecord, EventRecord, OpinionRecord, SessionRecord } from "../domain/types.js";
import type { Repositories } from "./types.js";

/** テストとローカル開発用。プロセスが終わると消える */
export function createInMemoryRepositories(): Repositories {
  const events = new Map<string, EventRecord>();
  const sessions = new Map<string, SessionRecord>();
  const opinions = new Map<string, OpinionRecord>();
  const bySubmission = new Map<string, string>();
  const analyses = new Map<string, AnalysisRunRecord>();
  const admins = new Map<string, AdminRecord>();
  const reactions = new Map<string, ReactionRecord>();
  const proposals = new Map<string, ProposalRecord>();
  const usage = new Map<string, number>();
  const presence = new Map<string, Map<string, string>>();
  const reactionKey = (opinionId: string, voterHash: string) => `${opinionId}#${voterHash}`;
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
        // 入力は書き換えない。保存済みの入力を引き継ぐ
        const stored = analyses.get(run.id);
        analyses.set(run.id, structuredClone(stored ? { ...run, input: stored.input } : run));
      },
      async replaceInput(run) {
        analyses.set(run.id, structuredClone(run));
      },
      async listBySession(sessionId): Promise<AnalysisRunSummary[]> {
        return [...analyses.values()]
          .filter((r) => r.sessionId === sessionId)
          .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))
          .map((r) => {
            const { input, ...rest } = structuredClone(r);
            return { ...rest, input: { hash: input.hash, opinionIds: inputOpinionIds(r) } };
          });
      },
    },
    presence: {
      async touch(sessionId, deviceHash, at) {
        const devices = presence.get(sessionId) ?? new Map<string, string>();
        devices.set(deviceHash, at);
        presence.set(sessionId, devices);
      },
      async countSince(sessionId, since) {
        return [...(presence.get(sessionId)?.values() ?? [])].filter((at) => at >= since).length;
      },
    },
    usage: {
      async consume(scope, dayKey, limit) {
        const key = `${scope}#${dayKey}`;
        const used = usage.get(key) ?? 0;
        if (used >= limit) return { allowed: false, used };
        usage.set(key, used + 1);
        return { allowed: true, used: used + 1 };
      },
      async used(scope, dayKey) {
        return usage.get(`${scope}#${dayKey}`) ?? 0;
      },
    },
    proposals: {
      async create(proposal) {
        proposals.set(proposal.id, { ...proposal });
      },
      async get(id) {
        const p = proposals.get(id);
        return p ? { ...p } : undefined;
      },
      async update(proposal) {
        proposals.set(proposal.id, { ...proposal });
      },
      async listByEvent(eventId) {
        return [...proposals.values()]
          .filter((p) => p.eventId === eventId)
          .map((p) => ({ ...p }))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      },
    },
    reactions: {
      async add(reaction) {
        const key = reactionKey(reaction.opinionId, reaction.voterHash);
        if (reactions.has(key)) return false;
        reactions.set(key, { ...reaction });
        return true;
      },
      async remove(opinionId, voterHash) {
        return reactions.delete(reactionKey(opinionId, voterHash));
      },
      async listBySession(sessionId) {
        return [...reactions.values()].filter((r) => r.sessionId === sessionId).map((r) => ({ ...r }));
      },
    },
    admins: {
      async get(email) {
        const a = admins.get(email);
        return a ? { ...a } : undefined;
      },
      async list() {
        return [...admins.values()].map((a) => ({ ...a })).sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a.email.localeCompare(b.email));
      },
      async createIfAbsent(admin) {
        if (admins.has(admin.email)) return false;
        admins.set(admin.email, { ...admin });
        return true;
      },
      async update(admin) {
        admins.set(admin.email, { ...admin });
      },
      async remove(email) {
        return admins.delete(email);
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
