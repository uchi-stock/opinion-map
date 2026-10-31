import { describe, expect, it } from "vitest";
import { FakeAnalysisProvider } from "../../core/src/analysis/fakeProvider.js";
import { MAX_ANALYSIS_OPINIONS, type AnalysisRunRecord } from "../../core/src/analysis/types.js";
import { createDynamoRepositories } from "../../core/src/repositories/dynamoRepositories.js";
import { MAX_ITEM_BYTES, MemoryKvStore } from "../../core/src/repositories/kvStore.js";
import { createTestApp } from "./helpers.js";

/**
 * 分析の実行は、入力の投稿(本文)と結果を持つ。投稿が多いと、DynamoDB の項目の上限(400KB)を超える。
 * 入力は、別の項目(100件ごと)に分けて置く。メモリ実装も、同じ上限を守らせて、超えないことを確かめる。
 */
const at = "2026-01-01T00:00:00.000Z";

/** 本文は上限いっぱい(300文字の日本語)にして、最悪に近い大きさで確かめる */
const longBody = (i: number) => `${"あ".repeat(296)}${String(i).padStart(4, "0")}`;

async function setup(count: number) {
  const store = new MemoryKvStore();
  const repos = createDynamoRepositories(store);
  const t = createTestApp({ repos, analysisProvider: new FakeAnalysisProvider() });
  const { sessionId } = await t.openSession();
  const kinds = ["idea", "question", "experience"] as const;
  for (let i = 0; i < count; i++) {
    await repos.opinions.createIfAbsent({
      id: `o${i}`,
      sessionId,
      submissionId: `submission-${String(i).padStart(8, "0")}`,
      body: longBody(i),
      kind: kinds[i % 3]!,
      status: "active",
      createdAt: at,
      updatedAt: at,
    });
  }
  return { ...t, repos, store, sessionId };
}

describe("多い投稿の分析の保存(400KBの上限)", () => {
  it(`上限(${MAX_ANALYSIS_OPINIONS}件)いっぱいでも、保存に失敗せず、分析が完了する`, async () => {
    const t = await setup(MAX_ANALYSIS_OPINIONS);
    const started = await t.call("POST", `/sessions/${t.sessionId}/analyses`, { admin: true });
    expect(started.statusCode).toBe(202);
    const done = (await t.call("GET", `/analyses/${started.json.id}`, { admin: true })).json;
    expect(done.status).toBe("succeeded");
    expect(done.inputCount).toBe(MAX_ANALYSIS_OPINIONS);
    // 全体を読み直すと、入力の本文が、すべて戻る
    const full = (await t.repos.analyses.get(started.json.id)) as AnalysisRunRecord;
    expect(full.input.opinions).toHaveLength(MAX_ANALYSIS_OPINIONS);
    // 並び順は文字列順(同じ時刻)なので、IDで探す
    expect(full.input.opinions.find((o) => o.id === "o1499")?.body).toBe(longBody(1499));
    expect(new Set(full.input.opinions.map((o) => o.id)).size).toBe(MAX_ANALYSIS_OPINIONS);
    expect(new TextEncoder().encode(JSON.stringify(full)).length).toBeGreaterThan(MAX_ITEM_BYTES); // 1項目なら、超える大きさ
  }, 60000);

  it("一覧は、本文を持たない軽い形で、IDと件数を返す", async () => {
    const t = await setup(250);
    const started = await t.call("POST", `/sessions/${t.sessionId}/analyses`, { admin: true });
    await t.call("GET", `/analyses/${started.json.id}`, { admin: true });
    const list = await t.repos.analyses.listBySession(t.sessionId);
    expect(list).toHaveLength(1);
    expect(list[0]!.input.opinionIds).toHaveLength(250);
    expect(JSON.stringify(list[0])).not.toContain("あああ");
    const api = (await t.call("GET", `/sessions/${t.sessionId}/analyses`, { admin: true })).json;
    expect(api.analyses[0].inputCount).toBe(250);
  });

  it(`上限(${MAX_ANALYSIS_OPINIONS}件)を超える投稿は、分かりやすく断る`, async () => {
    const t = await setup(MAX_ANALYSIS_OPINIONS + 1);
    const res = await t.call("POST", `/sessions/${t.sessionId}/analyses`, { admin: true });
    expect(res.statusCode).toBe(400);
    expect(res.json.error.code).toBe("too_many_opinions");
    expect(res.json.error.message).toContain(`${MAX_ANALYSIS_OPINIONS}件`);
  }, 60000);

  it("削除した投稿の本文は、分けた保存先からも消える。ほかの投稿は残る", async () => {
    const t = await setup(250);
    const started = await t.call("POST", `/sessions/${t.sessionId}/analyses`, { admin: true });
    await t.call("GET", `/analyses/${started.json.id}`, { admin: true });
    // 2つ目の chunk(100〜199番)にある投稿を、運営者が削除する
    const del = await t.call("POST", "/opinions/o150/moderation", { admin: true, body: { status: "deleted" } });
    expect(del.statusCode).toBe(200);
    const full = (await t.repos.analyses.get(started.json.id)) as AnalysisRunRecord;
    const deleted = full.input.opinions.find((o) => o.id === "o150")!;
    expect(deleted.body).toBe("");
    expect(full.input.opinions.find((o) => o.id === "o151")!.body).toBe(longBody(151));
    // 保存先の全項目に、削除した本文が残っていない
    for (const pk of ["ANALYSISINPUT#" + started.json.id + "#0000", "ANALYSISINPUT#" + started.json.id + "#0001", "ANALYSISINPUT#" + started.json.id + "#0002"]) {
      expect(JSON.stringify(await t.store.get(pk))).not.toContain(longBody(150));
    }
  }, 60000);

  it("以前の形(入力が実行の項目に入っている)の実行も、読めて、更新できて、本文を消せる", async () => {
    const store = new MemoryKvStore();
    const repos = createDynamoRepositories(store);
    const legacy: AnalysisRunRecord = {
      id: "r-old",
      sessionId: "s1",
      status: "succeeded",
      requestedAt: at,
      providerName: "fake",
      input: { opinions: [{ id: "a", body: "本文A", kind: "idea" }, { id: "b", body: "本文B", kind: "idea" }], hash: "h" },
    };
    await store.put({ pk: "ANALYSIS#r-old", gsi1pk: "SESSION#s1#ANALYSES", gsi1sk: `${at}#r-old`, data: legacy });
    expect((await repos.analyses.get("r-old"))?.input.opinions).toHaveLength(2);
    expect((await repos.analyses.listBySession("s1"))[0]!.input.opinionIds).toEqual(["a", "b"]);
    await repos.analyses.update({ ...legacy, status: "failed" });
    const afterUpdate = await repos.analyses.get("r-old");
    expect(afterUpdate?.status).toBe("failed");
    expect(afterUpdate?.input.opinions.map((o) => o.body)).toEqual(["本文A", "本文B"]);
    await repos.analyses.replaceInput({ ...legacy, input: { ...legacy.input, opinions: [{ id: "a", body: "", kind: "idea" }, legacy.input.opinions[1]!] } });
    const migrated = await repos.analyses.get("r-old");
    expect(migrated?.input.opinions.map((o) => o.body)).toEqual(["", "本文B"]);
  });

  it("メモリ実装は、400KBを超える項目を断る(設計の見落としを見つける)", async () => {
    const store = new MemoryKvStore();
    await expect(store.put({ pk: "BIG", data: "x".repeat(MAX_ITEM_BYTES + 1) })).rejects.toThrow(/大きすぎ/);
  });
});
