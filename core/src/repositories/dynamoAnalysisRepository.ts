import type { AnalysisOpinion, AnalysisRunRecord, AnalysisRunSummary } from "../analysis/types.js";
import type { KvItem, KvStore } from "./kvStore.js";
import type { Repositories } from "./types.js";

/** 実行中の分析のロックの期限。落ちたプロセスのロックが、いつまでも残らないようにする */
const ANALYSIS_LOCK_SECONDS = 2 * 60 * 60;

const data = <T>(item: KvItem | undefined): T | undefined => (item ? (item.data as T) : undefined);
const sortKey = (createdAt: string, id: string) => `${createdAt}#${id}`;
const analysisItem = (r: AnalysisRunRecord): KvItem => ({
  pk: `ANALYSIS#${r.id}`,
  gsi1pk: `SESSION#${r.sessionId}#ANALYSES`,
  gsi1sk: sortKey(r.requestedAt, r.id),
  data: r,
});
const lockKey = (sessionId: string) => `LOCK#ANALYSIS#${sessionId}`;
const isActive = (r: AnalysisRunRecord) => r.status === "queued" || r.status === "running";

/** 分析の実行の保存先(DynamoDB)。実行の項目、入力の chunk、実行中のロックを扱う */
export function createDynamoAnalysisRepository(store: KvStore, nowSeconds: () => number): Repositories["analyses"] {
  // 分析の実行の保存。DynamoDB の項目は 400KB までだが、入力の投稿(本文)は数百件で超える。
  // そこで、入力の投稿は、100件ごとの別の項目(chunk)に分けて置き、実行の項目には、IDと件数だけを持たせる。
  // 以前の形(実行の項目に、入力の投稿がそのまま入っている)も、読める。
  const INPUT_CHUNK_SIZE = 100;
  const inputChunkKey = (runId: string, index: number) => `ANALYSISINPUT#${runId}#${String(index).padStart(4, "0")}`;
  type StoredRun = Omit<AnalysisRunRecord, "input"> & {
    input: { hash: string; opinionIds: string[]; chunks: number } | { hash: string; opinions: AnalysisOpinion[] };
  };

  const toStoredItem = (run: AnalysisRunRecord, chunks: number): KvItem => {
    const { input, ...rest } = run;
    return analysisItem({ ...rest, input: { hash: input.hash, opinionIds: input.opinions.map((o) => o.id), chunks } } as unknown as AnalysisRunRecord);
  };
  const chunkItems = (run: AnalysisRunRecord): KvItem[] => {
    const items: KvItem[] = [];
    for (let i = 0; i * INPUT_CHUNK_SIZE < run.input.opinions.length; i++) {
      items.push({
        pk: inputChunkKey(run.id, i),
        data: { opinions: run.input.opinions.slice(i * INPUT_CHUNK_SIZE, (i + 1) * INPUT_CHUNK_SIZE) },
      });
    }
    return items;
  };
  /** 実行の全体(入力の本文を含む)を読む */
  async function loadRun(stored: StoredRun | undefined): Promise<AnalysisRunRecord | undefined> {
    if (!stored) return undefined;
    const storedInput = stored.input;
    if ("opinions" in storedInput) return stored as AnalysisRunRecord;
    const opinions: AnalysisOpinion[] = [];
    for (let i = 0; i < storedInput.chunks; i++) {
      const chunk = data<{ opinions: AnalysisOpinion[] }>(await store.get(inputChunkKey(stored.id, i)));
      if (chunk) opinions.push(...chunk.opinions);
    }
    const { input, ...rest } = stored;
    return { ...rest, input: { hash: input.hash, opinions } };
  }
  const toSummary = (stored: StoredRun): AnalysisRunSummary => {
    const { input, ...rest } = stored;
    return { ...rest, input: { hash: input.hash, opinionIds: "opinions" in input ? input.opinions.map((o) => o.id) : input.opinionIds } };
  };

  /** 入力を分けた形で、実行の項目と chunk を、まとめて書く */
  async function writeWhole(run: AnalysisRunRecord): Promise<void> {
    const chunks = chunkItems(run);
    if (chunks.length > 98) throw new Error("分析の入力の投稿が多すぎて、保存できません");
    const result = await store.transactWrite([
      { type: "put", item: toStoredItem(run, chunks.length) },
      ...chunks.map((item) => ({ type: "put" as const, item })),
    ]);
    if (result !== "ok") throw new Error("分析の入力を書けませんでした");
  }

  return {
    async createIfNoActive(run) {
      const chunks = chunkItems(run);
      // 1つのトランザクションに入れられる項目は100まで。ロックと実行の分を引いた数が、chunk の上限
      if (chunks.length > 98) throw new Error("分析の入力の投稿が多すぎて、保存できません");
      for (let attempt = 0; attempt < 2; attempt++) {
        // 実行中のロックと実行を、不可分に書く。並行して来ても、1つしか開始されない
        const lock: KvItem = {
          pk: lockKey(run.sessionId),
          ttl: nowSeconds() + ANALYSIS_LOCK_SECONDS,
          data: { runId: run.id },
        };
        const result = await store.transactWrite([
          { type: "put", item: lock, condition: { type: "notExistsOrExpired", now: nowSeconds() } },
          { type: "put", item: toStoredItem(run, chunks.length) },
          ...chunks.map((item) => ({ type: "put" as const, item })),
        ]);
        if (result === "ok") return { run, created: true };

        const holder = data<{ runId: string }>(await store.get(lockKey(run.sessionId)));
        const active = holder ? data<StoredRun>(await store.get(`ANALYSIS#${holder.runId}`)) : undefined;
        if (active && isActive(active as AnalysisRunRecord)) return { run: (await loadRun(active))!, created: false };
        // 実行がすでに終わっているのにロックが残っている（解除に失敗した）。外して、もう一度試す
        if (holder) await store.delete(lockKey(run.sessionId), { field: "runId", value: holder.runId });
      }
      throw new Error("分析のロックを取得できませんでした");
    },
    async get(id) {
      return loadRun(data<StoredRun>(await store.get(`ANALYSIS#${id}`)));
    },
    async update(run) {
      // 入力は書き換えない。保存済みの入力の形(分けた形か、以前の形)を引き継ぐ
      const stored = data<StoredRun>(await store.get(`ANALYSIS#${run.id}`));
      if (stored) {
        const { input: _ignored, ...rest } = run;
        await store.put(analysisItem({ ...rest, input: stored.input } as unknown as AnalysisRunRecord));
      } else {
        await writeWhole(run);
      }
      // 終わった実行は、ロックを外す。他の実行のロックは外さない
      if (!isActive(run)) await store.delete(lockKey(run.sessionId), { field: "runId", value: run.id });
    },
    async replaceInput(run) {
      await writeWhole(run);
    },
    async listBySession(sessionId) {
      return (await store.queryByGsi1(`SESSION#${sessionId}#ANALYSES`)).map((i) => toSummary(i.data as StoredRun));
    },
  };
}
