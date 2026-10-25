import type { AnalysisRunRecord } from "../../../backend/src/analysis/types.ts";
import type { EventRecord, OperatorTokenRecord, OpinionRecord, SessionRecord } from "../../../backend/src/domain/types.ts";
import type { Repositories } from "../../../backend/src/repositories/types.ts";

export const DEMO_DATA_KEY = "opinion-map-demo-data";

interface Data {
  events: EventRecord[];
  sessions: SessionRecord[];
  opinions: OpinionRecord[];
  analyses: AnalysisRunRecord[];
  operatorTokens: OperatorTokenRecord[];
}

type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const emptyData = (): Data => ({ events: [], sessions: [], opinions: [], analyses: [], operatorTokens: [] });

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
      async listBySession(sessionId) {
        return read()
          .opinions.filter((o) => o.sessionId === sessionId && o.status === "active")
          .sort(byCreatedAt);
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
        const d = read();
        d.analyses = d.analyses.map((r) => (r.id === run.id ? run : r));
        write(d);
      },
      async listBySession(sessionId) {
        return read()
          .analyses.filter((r) => r.sessionId === sessionId)
          .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
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
  };
}

export function resetDemoData(storage: KeyValueStorage): void {
  try {
    storage.removeItem(DEMO_DATA_KEY);
  } catch {
    // 消せなくても、何もしない
  }
}
