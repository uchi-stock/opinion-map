import type { AnalysisRunRecord } from "../analysis/types.js";
import type { AdminRecord, ProposalRecord, ReactionRecord, EventRecord, OperatorTokenRecord, OpinionRecord, SessionRecord } from "../domain/types.js";
import type { InsightRecord } from "../insights/types.js";
import type { KvItem, KvStore } from "./kvStore.js";
import type { Repositories } from "./types.js";

/** 実行中の分析のロックの期限。落ちたプロセスのロックが、いつまでも残らないようにする */
const ANALYSIS_LOCK_SECONDS = 2 * 60 * 60;

const data = <T>(item: KvItem | undefined): T | undefined => (item ? (item.data as T) : undefined);
const sortKey = (createdAt: string, id: string) => `${createdAt}#${id}`;

/**
 * 1つのテーブルに、すべての種類の項目を置く設計である。
 * 主キー pk は「種類#ID」で、一覧は GSI1（gsi1pk と gsi1sk）で引く。
 *
 * 項目は DynamoDB の 400KB までである。分析の実行は、入力の投稿と結果を持つため、
 * 投稿が数千件になると超えうる。その場合は、本文を別の保存先（S3 など）に移す必要がある。
 */
export function createDynamoRepositories(store: KvStore, now: () => Date = () => new Date()): Repositories {
  const nowSeconds = () => Math.floor(now().getTime() / 1000);

  const eventItem = (e: EventRecord): KvItem => ({
    pk: `EVENT#${e.id}`,
    gsi1pk: "EVENTS",
    gsi1sk: sortKey(e.createdAt, e.id),
    data: e,
  });
  const sessionItem = (s: SessionRecord): KvItem => ({
    pk: `SESSION#${s.id}`,
    gsi1pk: `EVENT#${s.eventId}#SESSIONS`,
    gsi1sk: sortKey(s.createdAt, s.id),
    data: s,
  });
  const opinionItem = (o: OpinionRecord): KvItem => ({
    pk: `OPINION#${o.id}`,
    gsi1pk: `SESSION#${o.sessionId}#OPINIONS`,
    gsi1sk: sortKey(o.createdAt, o.id),
    data: o,
  });
  const submissionKey = (sessionId: string, submissionId: string) => `SUBMISSION#${sessionId}#${submissionId}`;
  const analysisItem = (r: AnalysisRunRecord): KvItem => ({
    pk: `ANALYSIS#${r.id}`,
    gsi1pk: `SESSION#${r.sessionId}#ANALYSES`,
    gsi1sk: sortKey(r.requestedAt, r.id),
    data: r,
  });
  const lockKey = (sessionId: string) => `LOCK#ANALYSIS#${sessionId}`;
  const isActive = (r: AnalysisRunRecord) => r.status === "queued" || r.status === "running";
  const tokenItem = (t: OperatorTokenRecord): KvItem => ({
    pk: `OPTOKEN#${t.id}`,
    gsi1pk: `EVENT#${t.eventId}#OPTOKENS`,
    gsi1sk: sortKey(t.createdAt, t.id),
    data: t,
  });
  const proposalItem = (p: ProposalRecord): KvItem => ({
    pk: `PROPOSAL#${p.id}`,
    gsi1pk: `EVENT#${p.eventId}#PROPOSALS`,
    gsi1sk: sortKey(p.createdAt, p.id),
    data: p,
  });
  const reactionItem = (r: ReactionRecord): KvItem => ({
    pk: `REACTION#${r.opinionId}#${r.voterHash}`,
    gsi1pk: `SESSION#${r.sessionId}#REACTIONS`,
    gsi1sk: `${r.opinionId}#${r.voterHash}`,
    data: r,
  });
  const adminItem = (a: AdminRecord): KvItem => ({
    pk: `ADMIN#${a.email}`,
    gsi1pk: "ADMINS",
    gsi1sk: sortKey(a.addedAt, a.email),
    data: a,
  });
  const insightItem = (i: InsightRecord): KvItem => ({
    pk: `INSIGHT#${i.id}`,
    gsi1pk: `ANALYSIS#${i.analysisRunId}#INSIGHTS`,
    gsi1sk: sortKey(i.createdAt, i.id),
    data: i,
  });

  async function listOpinions(sessionId: string, keep: (o: OpinionRecord) => boolean): Promise<OpinionRecord[]> {
    const items = await store.queryByGsi1(`SESSION#${sessionId}#OPINIONS`);
    return items.map((i) => i.data as OpinionRecord).filter(keep);
  }

  const opinions: Repositories["opinions"] = {
    async createIfAbsent(opinion) {
      // 送信IDの印と投稿を、不可分に書く。同じ送信IDが並行して来ても、1つしか作られない
      const marker: KvItem = {
        pk: submissionKey(opinion.sessionId, opinion.submissionId),
        data: { opinionId: opinion.id },
      };
      const result = await store.transactWrite([
        { type: "put", item: marker, condition: { type: "notExists" } },
        { type: "put", item: opinionItem(opinion) },
      ]);
      if (result === "ok") return { opinion, created: true };
      const existing = await opinions.findBySubmission(opinion.sessionId, opinion.submissionId);
      if (!existing) throw new Error("送信IDの印があるのに、投稿が見つかりません");
      return { opinion: existing, created: false };
    },
    async findBySubmission(sessionId, submissionId) {
      const marker = data<{ opinionId: string }>(await store.get(submissionKey(sessionId, submissionId)));
      return marker ? data<OpinionRecord>(await store.get(`OPINION#${marker.opinionId}`)) : undefined;
    },
    async get(id) {
      return data<OpinionRecord>(await store.get(`OPINION#${id}`));
    },
    async update(opinion) {
      await store.put(opinionItem(opinion));
    },
    listBySession: (sessionId) => listOpinions(sessionId, (o) => o.status === "active"),
    listManageableBySession: (sessionId) => listOpinions(sessionId, (o) => o.status !== "deleted"),
    countCreatedSince(sessionId, sinceIso) {
      return store.countByGsi1(`SESSION#${sessionId}#OPINIONS`, { fromSk: sinceIso });
    },
  };

  const analyses: Repositories["analyses"] = {
    async createIfNoActive(run) {
      for (let attempt = 0; attempt < 2; attempt++) {
        // 実行中のロックと実行を、不可分に書く。並行して来ても、1つしか開始されない
        const lock: KvItem = {
          pk: lockKey(run.sessionId),
          ttl: nowSeconds() + ANALYSIS_LOCK_SECONDS,
          data: { runId: run.id },
        };
        const result = await store.transactWrite([
          { type: "put", item: lock, condition: { type: "notExistsOrExpired", now: nowSeconds() } },
          { type: "put", item: analysisItem(run) },
        ]);
        if (result === "ok") return { run, created: true };

        const holder = data<{ runId: string }>(await store.get(lockKey(run.sessionId)));
        const active = holder ? data<AnalysisRunRecord>(await store.get(`ANALYSIS#${holder.runId}`)) : undefined;
        if (active && isActive(active)) return { run: active, created: false };
        // 実行がすでに終わっているのにロックが残っている（解除に失敗した）。外して、もう一度試す
        if (holder) await store.delete(lockKey(run.sessionId), { field: "runId", value: holder.runId });
      }
      throw new Error("分析のロックを取得できませんでした");
    },
    async get(id) {
      return data<AnalysisRunRecord>(await store.get(`ANALYSIS#${id}`));
    },
    async update(run) {
      await store.put(analysisItem(run));
      // 終わった実行は、ロックを外す。他の実行のロックは外さない
      if (!isActive(run)) await store.delete(lockKey(run.sessionId), { field: "runId", value: run.id });
    },
    async listBySession(sessionId) {
      return (await store.queryByGsi1(`SESSION#${sessionId}#ANALYSES`)).map((i) => i.data as AnalysisRunRecord);
    },
  };

  return {
    events: {
      async create(event) {
        await store.put(eventItem(event), { type: "notExists" });
      },
      async get(id) {
        return data<EventRecord>(await store.get(`EVENT#${id}`));
      },
      async list() {
        return (await store.queryByGsi1("EVENTS")).map((i) => i.data as EventRecord);
      },
      async update(event) {
        await store.put(eventItem(event));
      },
    },
    sessions: {
      async create(session) {
        await store.put(sessionItem(session), { type: "notExists" });
      },
      async get(id) {
        return data<SessionRecord>(await store.get(`SESSION#${id}`));
      },
      async listByEvent(eventId) {
        return (await store.queryByGsi1(`EVENT#${eventId}#SESSIONS`)).map((i) => i.data as SessionRecord);
      },
      async update(session) {
        await store.put(sessionItem(session));
      },
    },
    opinions,
    analyses,
    operatorTokens: {
      async create(token) {
        // トークンのハッシュから引くための印も、不可分に書く
        const result = await store.transactWrite([
          { type: "put", item: { pk: `OPTOKENHASH#${token.tokenHash}`, data: { tokenId: token.id } }, condition: { type: "notExists" } },
          { type: "put", item: tokenItem(token), condition: { type: "notExists" } },
        ]);
        if (result !== "ok") throw new Error("同じトークンがすでにあります");
      },
      async get(id) {
        return data<OperatorTokenRecord>(await store.get(`OPTOKEN#${id}`));
      },
      async getByHash(tokenHash) {
        const ref = data<{ tokenId: string }>(await store.get(`OPTOKENHASH#${tokenHash}`));
        return ref ? data<OperatorTokenRecord>(await store.get(`OPTOKEN#${ref.tokenId}`)) : undefined;
      },
      async listByEvent(eventId) {
        return (await store.queryByGsi1(`EVENT#${eventId}#OPTOKENS`)).map((i) => i.data as OperatorTokenRecord);
      },
      async update(token) {
        await store.put(tokenItem(token));
      },
    },
    usage: {
      // 1回分ごとに、番号つきの印(USAGE#範囲#日#番号)を、条件付きで作る。最初に作れた番号が、その回の番号になる。
      // 上限までの番号がすべて使われていれば、上限に達している。同時に呼ばれても、同じ番号は2回作れない
      async consume(scope, dayKey, limit) {
        const day = `USAGE#${scope}#${dayKey}`;
        // 結果整合の件数を、出発点の目安にする(古くても、あとで順に確かめる)
        let n = Math.min(await store.countByGsi1(day), limit) + 1;
        n = Math.max(1, n - 1);
        for (; n <= limit; n++) {
          try {
            await store.put(
              { pk: `${day}#${n}`, gsi1pk: day, gsi1sk: String(n).padStart(6, "0"), ttl: nowSeconds() + 3 * 24 * 60 * 60, data: { n } },
              { type: "notExists" },
            );
            return { allowed: true, used: n };
          } catch (error) {
            const name = error instanceof Error ? `${error.name}:${error.message}` : "";
            if (!name.includes("ConditionalCheckFailed")) throw error;
          }
        }
        return { allowed: false, used: limit };
      },
      async used(scope, dayKey) {
        return store.countByGsi1(`USAGE#${scope}#${dayKey}`);
      },
    },
    proposals: {
      async create(proposal) {
        await store.put(proposalItem(proposal), { type: "notExists" });
      },
      async get(id) {
        return data<ProposalRecord>(await store.get(`PROPOSAL#${id}`));
      },
      async update(proposal) {
        await store.put(proposalItem(proposal));
      },
      async listByEvent(eventId) {
        return (await store.queryByGsi1(`EVENT#${eventId}#PROPOSALS`)).map((i) => i.data as ProposalRecord);
      },
    },
    reactions: {
      async add(reaction) {
        try {
          await store.put(reactionItem(reaction), { type: "notExists" });
          return true;
        } catch (error) {
          const name = error instanceof Error ? `${error.name}:${error.message}` : "";
          if (name.includes("ConditionalCheckFailed")) return false;
          throw error;
        }
      },
      async remove(opinionId, voterHash) {
        return store.delete(`REACTION#${opinionId}#${voterHash}`);
      },
      async listBySession(sessionId) {
        return (await store.queryByGsi1(`SESSION#${sessionId}#REACTIONS`)).map((i) => i.data as ReactionRecord);
      },
    },
    admins: {
      async get(email) {
        return data<AdminRecord>(await store.get(`ADMIN#${email}`));
      },
      async list() {
        return (await store.queryByGsi1("ADMINS")).map((i) => i.data as AdminRecord);
      },
      async createIfAbsent(admin) {
        try {
          await store.put(adminItem(admin), { type: "notExists" });
          return true;
        } catch (error) {
          // 条件を満たさない(すでにある)ときだけ false。それ以外の失敗は呼び出し側に伝える
          const name = error instanceof Error ? `${error.name}:${error.message}` : "";
          if (name.includes("ConditionalCheckFailed")) return false;
          throw error;
        }
      },
      async remove(email) {
        return store.delete(`ADMIN#${email}`);
      },
    },
    insights: {
      async create(insight) {
        await store.put(insightItem(insight), { type: "notExists" });
      },
      async get(id) {
        return data<InsightRecord>(await store.get(`INSIGHT#${id}`));
      },
      async update(insight) {
        await store.put(insightItem(insight));
      },
      async listByAnalysis(analysisRunId) {
        return (await store.queryByGsi1(`ANALYSIS#${analysisRunId}#INSIGHTS`)).map((i) => i.data as InsightRecord);
      },
    },
  };
}
