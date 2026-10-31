import { describe, expect, it } from "vitest";
import type { AnalysisRunRecord } from "../../core/src/analysis/types.js";
import type { OpinionRecord } from "../../core/src/domain/types.js";
import { createDynamoRepositories } from "../../core/src/repositories/dynamoRepositories.js";
import { MemoryKvStore } from "../../core/src/repositories/kvStore.js";

const at = "2026-01-01T00:00:00.000Z";
const opinion = (id: string, submissionId: string, over: Partial<OpinionRecord> = {}): OpinionRecord => ({
  id,
  sessionId: "s1",
  submissionId,
  body: "本文",
  kind: "idea",
  status: "active",
  createdAt: at,
  updatedAt: at,
  ...over,
});
const run = (id: string, over: Partial<AnalysisRunRecord> = {}): AnalysisRunRecord => ({
  id,
  sessionId: "s1",
  status: "running",
  requestedAt: at,
  providerName: "fake",
  input: { opinions: [], hash: "h" },
  ...over,
});

describe("投稿の二重送信（並行）", () => {
  it("同じ送信IDが同時に来ても、1件しか作られない", async () => {
    const repos = createDynamoRepositories(new MemoryKvStore());
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => repos.opinions.createIfAbsent(opinion(`o${i}`, "same-submission-id-0001"))),
    );
    expect(results.filter((r) => r.created)).toHaveLength(1);
    // 全員が、同じ投稿を受け取る
    expect(new Set(results.map((r) => r.opinion.id)).size).toBe(1);
    expect(await repos.opinions.listBySession("s1")).toHaveLength(1);
  });

  it("別の送信IDなら、それぞれ作られる", async () => {
    const repos = createDynamoRepositories(new MemoryKvStore());
    await Promise.all(["a", "b", "c"].map((s, i) => repos.opinions.createIfAbsent(opinion(`o${i}`, `submission-${s}-000000`))));
    expect(await repos.opinions.listBySession("s1")).toHaveLength(3);
  });

  it("別のテーマで、同じ送信IDを使っても、別の投稿になる", async () => {
    const repos = createDynamoRepositories(new MemoryKvStore());
    const a = await repos.opinions.createIfAbsent(opinion("o1", "same-submission-id-0001"));
    const b = await repos.opinions.createIfAbsent(opinion("o2", "same-submission-id-0001", { sessionId: "s2" }));
    expect([a.created, b.created]).toEqual([true, true]);
  });
});

describe("分析の重複実行の抑制（並行）", () => {
  it("同じテーマで同時に開始しても、1つしか開始されない", async () => {
    const repos = createDynamoRepositories(new MemoryKvStore());
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => repos.analyses.createIfNoActive(run(`r${i}`))));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.run.id)).size).toBe(1);
  });

  it("終わった実行のロックは外れ、次の実行を開始できる", async () => {
    const repos = createDynamoRepositories(new MemoryKvStore());
    const first = await repos.analyses.createIfNoActive(run("r1"));
    await repos.analyses.update({ ...first.run, status: "failed" });
    const second = await repos.analyses.createIfNoActive(run("r2"));
    expect(second).toMatchObject({ created: true, run: { id: "r2" } });
  });

  it("期限の切れたロックは、無視して開始できる", async () => {
    let now = Date.UTC(2026, 0, 1);
    const repos = createDynamoRepositories(new MemoryKvStore(), () => new Date(now));
    await repos.analyses.createIfNoActive(run("r1"));
    now += 3 * 60 * 60 * 1000;
    // r1 は running のままだが、ロックは失効している
    const next = await repos.analyses.createIfNoActive(run("r2"));
    expect(next.created).toBe(true);
  });

  it("別のテーマには影響しない", async () => {
    const repos = createDynamoRepositories(new MemoryKvStore());
    await repos.analyses.createIfNoActive(run("r1"));
    expect((await repos.analyses.createIfNoActive(run("r2", { sessionId: "s2" }))).created).toBe(true);
  });
});

describe("運営者トークンの引き当て", () => {
  it("ハッシュから引ける。同じハッシュは作れない", async () => {
    const repos = createDynamoRepositories(new MemoryKvStore());
    const token = { id: "t1", eventId: "e1", label: "x", tokenHash: "hash-1", createdAt: at };
    await repos.operatorTokens.create(token);
    expect(await repos.operatorTokens.getByHash("hash-1")).toEqual(token);
    expect(await repos.operatorTokens.getByHash("nope")).toBeUndefined();
    await expect(repos.operatorTokens.create({ ...token, id: "t2" })).rejects.toThrow();
  });
});

describe("投稿の一覧と数", () => {
  it("公開中だけ、運営者向けは削除済み以外、数はすべて", async () => {
    const repos = createDynamoRepositories(new MemoryKvStore());
    await repos.opinions.createIfAbsent(opinion("o1", "submission-a-000000", { createdAt: "2026-01-01T00:00:01.000Z" }));
    await repos.opinions.createIfAbsent(opinion("o2", "submission-b-000000", { status: "hidden", createdAt: "2026-01-01T00:00:02.000Z" }));
    await repos.opinions.createIfAbsent(opinion("o3", "submission-c-000000", { status: "deleted", createdAt: "2026-01-01T00:00:03.000Z" }));
    expect((await repos.opinions.listBySession("s1")).map((o) => o.id)).toEqual(["o1"]);
    expect((await repos.opinions.listManageableBySession("s1")).map((o) => o.id)).toEqual(["o1", "o2"]);
    expect(await repos.opinions.countCreatedSince("s1", "2026-01-01T00:00:02.000Z")).toBe(2);
    expect(await repos.opinions.countCreatedSince("s1", "2026-01-01T00:00:04.000Z")).toBe(0);
  });
});
