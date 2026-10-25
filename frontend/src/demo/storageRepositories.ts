import type { EventRecord, OpinionRecord, SessionRecord } from "../../../backend/src/domain/types.ts";
import type { Repositories } from "../../../backend/src/repositories/types.ts";

export const DEMO_DATA_KEY = "opinion-map-demo-data";

interface Data {
  events: EventRecord[];
  sessions: SessionRecord[];
  opinions: OpinionRecord[];
}

type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const emptyData = (): Data => ({ events: [], sessions: [], opinions: [] });

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
  };
}

export function resetDemoData(storage: KeyValueStorage): void {
  try {
    storage.removeItem(DEMO_DATA_KEY);
  } catch {
    // 消せなくても、何もしない
  }
}
