import { CreateTableCommand, DynamoDBClient, UpdateTimeToLiveCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";
import { createDynamoRepositories } from "../../core/src/repositories/dynamoRepositories.js";
import { DynamoKvStore, GSI1_NAME } from "../src/repositories/dynamoKvStore.js";
import { MemoryKvStore, type KvItem, type KvStore } from "../../core/src/repositories/kvStore.js";

/**
 * DynamoDB Local(実際の DynamoDB と同じ挙動の、手元用の実装)に対する、保存先の契約テスト。
 * メモリ実装と同じ期待で、DynamoDB 実装を確かめる。条件付き書き込み、トランザクション、GSI、並行の競合が対象。
 * DYNAMODB_ENDPOINT(例: http://localhost:8000)があるときだけ実行する。CI はサービスコンテナで起動する。
 */
const ENDPOINT = process.env["DYNAMODB_ENDPOINT"];

const TABLE = `opinion-map-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function createLocalStore(): Promise<KvStore> {
  const raw = new DynamoDBClient({
    endpoint: ENDPOINT,
    region: "ap-northeast-1",
    credentials: { accessKeyId: "local", secretAccessKey: "local" },
  });
  await raw.send(
    new CreateTableCommand({
      TableName: TABLE,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "gsi1pk", AttributeType: "S" },
        { AttributeName: "gsi1sk", AttributeType: "S" },
      ],
      KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
      GlobalSecondaryIndexes: [
        {
          IndexName: GSI1_NAME,
          KeySchema: [
            { AttributeName: "gsi1pk", KeyType: "HASH" },
            { AttributeName: "gsi1sk", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    }),
  );
  await raw.send(new UpdateTimeToLiveCommand({ TableName: TABLE, TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true } })).catch(() => {});
  return new DynamoKvStore(DynamoDBDocumentClient.from(raw), TABLE);
}

/** 他のテストと干渉しないよう、キーに接頭辞を付ける保存先 */
function prefixed(store: KvStore, prefix: string): KvStore {
  const p = (k: string) => `${prefix}:${k}`;
  const mapItem = (i: KvItem): KvItem => ({ ...i, pk: p(i.pk), ...(i.gsi1pk ? { gsi1pk: p(i.gsi1pk) } : {}) });
  const unmapItem = (i: KvItem): KvItem => ({ ...i, pk: i.pk.slice(prefix.length + 1), ...(i.gsi1pk ? { gsi1pk: i.gsi1pk.slice(prefix.length + 1) } : {}) });
  return {
    get: async (pk) => {
      const i = await store.get(p(pk));
      return i ? unmapItem(i) : undefined;
    },
    put: (item, condition) => store.put(mapItem(item), condition),
    transactWrite: (ops) =>
      store.transactWrite(ops.map((op) => (op.type === "put" ? { ...op, item: mapItem(op.item) } : { ...op, pk: p(op.pk) }))),
    queryByGsi1: async (g, o) => (await store.queryByGsi1(p(g), o)).map(unmapItem),
    countByGsi1: (g, o) => store.countByGsi1(p(g), o),
    delete: (pk, c) => store.delete(p(pk), c),
  };
}

const describeLocal = ENDPOINT ? describe : describe.skip;

/**
 * 条件の失敗は、実装によって、名前(DynamoDB: ConditionalCheckFailedException)か、
 * メッセージ(メモリ)に現れる。リポジトリは、両方を見て判断する。ここも同じ見方で確かめる
 */
async function expectConditionFailure(promise: Promise<unknown>): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, "条件の失敗で、例外になること").toBeInstanceOf(Error);
  const e = error as Error;
  expect(`${e.name}:${e.message}`).toContain("ConditionalCheckFailed");
}

describeLocal("DynamoDB Local に対する保存先の契約", () => {
  let counter = 0;
  const lazy = (() => {
    let promise: Promise<KvStore> | undefined;
    return () => (promise ??= createLocalStore());
  })();
  const fresh = async (kind: "memory" | "dynamo") =>
    kind === "memory" ? new MemoryKvStore() : prefixed(await lazy(), `t${Date.now()}-${++counter}`);

  for (const kind of ["memory", "dynamo"] as const) {
    describe(`${kind} 実装`, () => {
      it("書いて読める。無ければ undefined", async () => {
        const s = await fresh(kind);
        expect(await s.get("A#1")).toBeUndefined();
        await s.put({ pk: "A#1", data: { n: 1 } });
        expect((await s.get("A#1"))?.data).toEqual({ n: 1 });
      });

      it("notExists は、同じキーがあれば失敗する", async () => {
        const s = await fresh(kind);
        await s.put({ pk: "K", data: 1 }, { type: "notExists" });
        await expectConditionFailure(s.put({ pk: "K", data: 2 }, { type: "notExists" }));
        expect((await s.get("K"))?.data).toBe(1);
      });

      it("notExistsOrExpired は、期限が切れていれば上書きできる", async () => {
        const s = await fresh(kind);
        await s.put({ pk: "L", ttl: 100, data: 1 });
        await expectConditionFailure(s.put({ pk: "L", ttl: 999, data: 2 }, { type: "notExistsOrExpired", now: 50 }));
        await s.put({ pk: "L", ttl: 999, data: 3 }, { type: "notExistsOrExpired", now: 200 });
        expect((await s.get("L"))?.data).toBe(3);
      });

      it("transactWrite は、すべて成功するか、何も書かないか", async () => {
        const s = await fresh(kind);
        await s.put({ pk: "EXIST", data: 0 });
        const conflict = await s.transactWrite([
          { type: "put", item: { pk: "NEW", data: 1 }, condition: { type: "notExists" } },
          { type: "put", item: { pk: "EXIST", data: 2 }, condition: { type: "notExists" } },
        ]);
        expect(conflict).toBe("conflict");
        expect(await s.get("NEW")).toBeUndefined();
        expect(await s.transactWrite([{ type: "put", item: { pk: "NEW", data: 1 }, condition: { type: "notExists" } }])).toBe("ok");
      });

      it("GSI は、gsi1sk の昇順で返し、fromSk で絞れる。件数も数えられる", async () => {
        const s = await fresh(kind);
        for (const sk of ["003", "001", "002"]) await s.put({ pk: `I#${sk}`, gsi1pk: "LIST", gsi1sk: sk, data: sk });
        await s.put({ pk: "OTHER", gsi1pk: "ELSE", gsi1sk: "001", data: "x" });
        // GSI は結果整合。反映を待ってから確かめる
        await expect.poll(async () => (await s.queryByGsi1("LIST")).map((i) => i.gsi1sk), { timeout: 3000 }).toEqual(["001", "002", "003"]);
        expect((await s.queryByGsi1("LIST", { fromSk: "002" })).map((i) => i.gsi1sk)).toEqual(["002", "003"]);
        expect(await s.countByGsi1("LIST")).toBe(3);
        expect(await s.countByGsi1("LIST", { fromSk: "003" })).toBe(1);
      });

      it("条件付きの削除は、条件が合うときだけ消す", async () => {
        const s = await fresh(kind);
        await s.put({ pk: "D", data: { owner: "a" } });
        expect(await s.delete("D", { field: "owner", value: "b" })).toBe(false);
        expect(await s.get("D")).toBeDefined();
        expect(await s.delete("D", { field: "owner", value: "a" })).toBe(true);
        expect(await s.get("D")).toBeUndefined();
      });

      it("並行: 同じキーへの notExists は、ちょうど1つだけ成功する", async () => {
        const s = await fresh(kind);
        const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => s.put({ pk: "RACE", data: i }, { type: "notExists" })));
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      });

      it("並行: 同じキーを書くトランザクションは、成功が1つだけ(残りは conflict か、衝突)", async () => {
        const s = await fresh(kind);
        const results = await Promise.allSettled(
          Array.from({ length: 8 }, (_, i) =>
            s.transactWrite([{ type: "put", item: { pk: "TX", data: i }, condition: { type: "notExists" } }]),
          ),
        );
        const ok = results.filter((r) => r.status === "fulfilled" && r.value === "ok");
        expect(ok).toHaveLength(1);
        expect((await s.get("TX"))?.data).toBeDefined();
      });
    });
  }

  describe("リポジトリ(DynamoDB 実装)の並行", () => {
    const at = "2026-01-01T00:00:00.000Z";
    const opinion = (id: string, submissionId: string) => ({
      id,
      sessionId: "s1",
      submissionId,
      body: "意見",
      kind: "idea" as const,
      status: "active" as const,
      createdAt: at,
      updatedAt: at,
    });

    it("同じ送信IDの投稿を同時に送っても、1件だけ作られる", async () => {
      const repos = createDynamoRepositories(await fresh("dynamo"));
      const results = await Promise.all(Array.from({ length: 6 }, (_, i) => repos.opinions.createIfAbsent(opinion(`o${i}`, "same-submission-id"))));
      expect(results.filter((r) => r.created)).toHaveLength(1);
      expect(new Set(results.map((r) => r.opinion.id)).size).toBe(1);
    });

    it("同じセッションの分析を同時に始めても、進行中は1つだけ", async () => {
      const repos = createDynamoRepositories(await fresh("dynamo"));
      const run = (id: string) => ({
        id,
        sessionId: "s1",
        status: "queued" as const,
        requestedAt: at,
        providerName: "fake",
        input: { opinions: [], hash: "h" },
      });
      const results = await Promise.all(Array.from({ length: 6 }, (_, i) => repos.analyses.createIfNoActive(run(`r${i}`))));
      expect(results.filter((r) => r.created)).toHaveLength(1);
    });

    it("上限いっぱい(1500件、本文は最大の長さ)の分析の実行を、分けて保存し、すべて読み戻せる", async () => {
      const repos = createDynamoRepositories(await fresh("dynamo"));
      const opinions = Array.from({ length: 1500 }, (_, i) => ({
        id: `o${i}`,
        body: `${"あ".repeat(296)}${String(i).padStart(4, "0")}`,
        kind: "idea" as const,
      }));
      const run = {
        id: "big",
        sessionId: "s-big",
        status: "queued" as const,
        requestedAt: at,
        providerName: "fake",
        input: { opinions, hash: "h" },
      };
      const created = await repos.analyses.createIfNoActive(run);
      expect(created.created).toBe(true);
      await repos.analyses.update({ ...run, status: "succeeded", result: { overview: "概要", clusters: [], unclassifiedOpinionIds: opinions.map((o) => o.id) } });
      const full = await repos.analyses.get("big");
      expect(full?.input.opinions).toHaveLength(1500);
      expect(full?.input.opinions[1499]?.body).toBe(opinions[1499]!.body);
      expect(full?.status).toBe("succeeded");
      expect((await repos.analyses.listBySession("s-big"))[0]!.input.opinionIds).toHaveLength(1500);
    }, 60000);

    it("1日の上限は、同時に使っても超えない", async () => {
      const repos = createDynamoRepositories(await fresh("dynamo"));
      const results = await Promise.all(Array.from({ length: 12 }, () => repos.usage.consume("analysis:e1", "2026-01-01", 5)));
      expect(results.filter((r) => r.allowed)).toHaveLength(5);
      expect(await repos.usage.used("analysis:e1", "2026-01-01")).toBe(5);
    });

    it("同じ投票者のいいねは、同時に付けても1回だけ", async () => {
      const repos = createDynamoRepositories(await fresh("dynamo"));
      const reaction = { sessionId: "s1", opinionId: "o1", voterHash: "v", createdAt: at };
      const results = await Promise.all(Array.from({ length: 6 }, () => repos.reactions.add(reaction)));
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await repos.reactions.listBySession("s1")).toHaveLength(1);
    });
  });
});
