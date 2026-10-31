import type { InsightRecord } from "../../../core/src/insights/types.ts";
import type { AnalysisRunRecord } from "../../../core/src/analysis/types.ts";
import type { AdminRecord, ProposalRecord, ReactionRecord, EventRecord, OperatorTokenRecord, OpinionRecord, SessionRecord } from "../../../core/src/domain/types.ts";
import type { Repositories } from "../../../core/src/repositories/types.ts";

export const DEMO_DATA_KEY = "opinion-map-demo-data";

interface Data {
  events: EventRecord[];
  sessions: SessionRecord[];
  opinions: OpinionRecord[];
  analyses: AnalysisRunRecord[];
  operatorTokens: OperatorTokenRecord[];
  admins: AdminRecord[];
  reactions: ReactionRecord[];
  proposals: ProposalRecord[];
  usage: Record<string, number>;
  /** テーマごとの、端末のハッシュと最後に見た時刻 */
  presence: Record<string, Record<string, string>>;
  insights: InsightRecord[];
}

type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const emptyData = (): Data => ({ events: [], sessions: [], opinions: [], analyses: [], operatorTokens: [], admins: [], reactions: [], proposals: [], usage: {}, presence: {}, insights: [] });

/**
 * デモ版のデータ置き場。ブラウザの localStorage に保存する。
 * 毎回、保存先から読み直すので、別のタブ（運営者の画面と参加者の画面）が同じデータを共有できる。
 * 保存できない環境（プライベートブラウズなど）では、そのページの間だけ、メモリ上に持つ。
 */
export function createStorageRepositories(storage: KeyValueStorage): Repositories {
  let memory: Data = emptyData();

  function read(): Data {
    try {
      const raw = storage.getItem(DEMO_DATA_KEY);
      // 保存先が正常に動いていて、キーがなければ、空である（リセットの後など）
      const parsed = raw ? (JSON.parse(raw) as Partial<Data>) : {};
      memory = {
        events: parsed.events ?? [],
        sessions: parsed.sessions ?? [],
        opinions: parsed.opinions ?? [],
        analyses: parsed.analyses ?? [],
        operatorTokens: parsed.operatorTokens ?? [],
        admins: parsed.admins ?? [],
        reactions: parsed.reactions ?? [],
        proposals: parsed.proposals ?? [],
        usage: parsed.usage ?? {},
        presence: parsed.presence ?? {},
        insights: parsed.insights ?? [],
      };
    } catch {
      // 読めないとき（保存先が使えない、内容が壊れている）は、メモリ上の内容を使う
    }
    return structuredClone(memory);
  }

  function write(data: Data): void {
    memory = data;
    try {
      storage.setItem(DEMO_DATA_KEY, JSON.stringify(data));
    } catch {
      // 保存できなくても、このページの間は動く
    }
  }

  const byCreatedAt = <T extends { createdAt: string }>(a: T, b: T) => a.createdAt.localeCompare(b.createdAt);

  return {
    events: {
      async create(event) {
        const d = read();
        d.events.push(event);
        write(d);
      },
      async get(id) {
        return read().events.find((e) => e.id === id);
      },
      async list() {
        return read().events.sort(byCreatedAt);
      },
      async update(event) {
        const d = read();
        d.events = d.events.map((e) => (e.id === event.id ? event : e));
        write(d);
      },
    },
    sessions: {
      async create(session) {
        const d = read();
        d.sessions.push(session);
        write(d);
      },
      async get(id) {
        return read().sessions.find((s) => s.id === id);
      },
      async listByEvent(eventId) {
        return read()
          .sessions.filter((s) => s.eventId === eventId)
          .sort(byCreatedAt);
      },
      async update(session) {
        const d = read();
        d.sessions = d.sessions.map((s) => (s.id === session.id ? session : s));
        write(d);
      },
    },
    opinions: {
      async createIfAbsent(opinion) {
        const d = read();
        const existing = d.opinions.find(
          (o) => o.sessionId === opinion.sessionId && o.submissionId === opinion.submissionId,
        );
        if (existing) return { opinion: existing, created: false };
        d.opinions.push(opinion);
        write(d);
        return { opinion, created: true };
      },
      async findBySubmission(sessionId, submissionId) {
        return read().opinions.find((o) => o.sessionId === sessionId && o.submissionId === submissionId);
      },
      async get(id) {
        return read().opinions.find((o) => o.id === id);
      },
      async update(opinion) {
        const d = read();
        d.opinions = d.opinions.map((o) => (o.id === opinion.id ? opinion : o));
        write(d);
      },
      async listBySession(sessionId) {
        return read()
          .opinions.filter((o) => o.sessionId === sessionId && o.status === "active")
          .sort(byCreatedAt);
      },
      async listManageableBySession(sessionId) {
        return read()
          .opinions.filter((o) => o.sessionId === sessionId && o.status !== "deleted")
          .sort(byCreatedAt);
      },
      async countCreatedSince(sessionId, sinceIso) {
        return read().opinions.filter((o) => o.sessionId === sessionId && o.createdAt >= sinceIso).length;
      },
    },
    analyses: {
      async createIfNoActive(run) {
        const d = read();
        const active = d.analyses.find(
          (r) => r.sessionId === run.sessionId && (r.status === "queued" || r.status === "running"),
        );
        if (active) return { run: active, created: false };
        d.analyses.push(run);
        write(d);
        return { run, created: true };
      },
      async get(id) {
        return read().analyses.find((r) => r.id === id);
      },
      async update(run) {
        // 入力は書き換えない。保存済みの入力を引き継ぐ
        const d = read();
        d.analyses = d.analyses.map((r) => (r.id === run.id ? { ...run, input: r.input } : r));
        write(d);
      },
      async replaceInput(run) {
        const d = read();
        d.analyses = d.analyses.map((r) => (r.id === run.id ? run : r));
        write(d);
      },
      async listBySession(sessionId) {
        return read()
          .analyses.filter((r) => r.sessionId === sessionId)
          .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))
          .map((r) => {
            const { input, ...rest } = r;
            return { ...rest, input: { hash: input.hash, opinionIds: input.opinions.map((o) => o.id) } };
          });
      },
    },
    operatorTokens: {
      async create(token) {
        const d = read();
        d.operatorTokens.push(token);
        write(d);
      },
      async get(id) {
        return read().operatorTokens.find((t) => t.id === id);
      },
      async getByHash(tokenHash) {
        return read().operatorTokens.find((t) => t.tokenHash === tokenHash);
      },
      async listByEvent(eventId) {
        return read()
          .operatorTokens.filter((t) => t.eventId === eventId)
          .sort(byCreatedAt);
      },
      async update(token) {
        const d = read();
        d.operatorTokens = d.operatorTokens.map((t) => (t.id === token.id ? token : t));
        write(d);
      },
    },
    presence: {
      async touch(sessionId, deviceHash, at) {
        const d = read();
        d.presence[sessionId] = { ...d.presence[sessionId], [deviceHash]: at };
        write(d);
      },
      async countSince(sessionId, since) {
        return Object.values(read().presence[sessionId] ?? {}).filter((at) => at >= since).length;
      },
    },
    usage: {
      async consume(scope, dayKey, limit) {
        const d = read();
        const key = `${scope}#${dayKey}`;
        const used = d.usage[key] ?? 0;
        if (used >= limit) return { allowed: false, used };
        d.usage[key] = used + 1;
        write(d);
        return { allowed: true, used: used + 1 };
      },
      async used(scope, dayKey) {
        return read().usage[`${scope}#${dayKey}`] ?? 0;
      },
    },
    proposals: {
      async create(proposal) {
        const d = read();
        d.proposals.push(proposal);
        write(d);
      },
      async get(id) {
        return read().proposals.find((p) => p.id === id);
      },
      async update(proposal) {
        const d = read();
        d.proposals = d.proposals.map((p) => (p.id === proposal.id ? proposal : p));
        write(d);
      },
      async listByEvent(eventId) {
        return read()
          .proposals.filter((p) => p.eventId === eventId)
          .sort(byCreatedAt);
      },
    },
    reactions: {
      async add(reaction) {
        const d = read();
        if (d.reactions.some((r) => r.opinionId === reaction.opinionId && r.voterHash === reaction.voterHash)) return false;
        d.reactions.push(reaction);
        write(d);
        return true;
      },
      async remove(opinionId, voterHash) {
        const d = read();
        const next = d.reactions.filter((r) => !(r.opinionId === opinionId && r.voterHash === voterHash));
        if (next.length === d.reactions.length) return false;
        d.reactions = next;
        write(d);
        return true;
      },
      async listBySession(sessionId) {
        return read().reactions.filter((r) => r.sessionId === sessionId);
      },
    },
    admins: {
      async get(email) {
        return read().admins.find((a) => a.email === email);
      },
      async list() {
        return read().admins.sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a.email.localeCompare(b.email));
      },
      async createIfAbsent(admin) {
        const d = read();
        if (d.admins.some((a) => a.email === admin.email)) return false;
        d.admins.push(admin);
        write(d);
        return true;
      },
      async update(admin) {
        const d = read();
        d.admins = d.admins.map((a) => (a.email === admin.email ? { ...admin } : a));
        write(d);
      },
      async remove(email) {
        const d = read();
        const next = d.admins.filter((a) => a.email !== email);
        if (next.length === d.admins.length) return false;
        d.admins = next;
        write(d);
        return true;
      },
    },
    insights: {
      async create(insight) {
        const d = read();
        d.insights.push(insight);
        write(d);
      },
      async get(id) {
        return read().insights.find((i) => i.id === id);
      },
      async update(insight) {
        const d = read();
        d.insights = d.insights.map((i) => (i.id === insight.id ? insight : i));
        write(d);
      },
      async listByAnalysis(analysisRunId) {
        return read()
          .insights.filter((i) => i.analysisRunId === analysisRunId)
          .sort(byCreatedAt);
      },
    },
  };
}

export function resetDemoData(storage: KeyValueStorage): void {
  try {
    storage.removeItem(DEMO_DATA_KEY);
  } catch {
    // 消せなくても、何もしない
  }
}
