import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.js";

const SEED = "seed-owner@example.com";

describe("管理者の一覧(API)", () => {
  function setup(seed: string[] = [SEED]) {
    return createTestApp({
      ownerLogin: { googleClientId: "client", sessionSecret: "s".repeat(32), ownerEmails: seed },
    });
  }

  it("一覧が空のときだけ、環境変数の初期値が登録される", async () => {
    const t = setup(["Seed-Owner@Example.com", " b@example.com "]);
    const list = (await t.call("GET", "/admins", { admin: true })).json.admins;
    expect(list.map((a: { email: string }) => a.email).sort()).toEqual(["b@example.com", SEED]);
    expect(list[0].addedBy).toBe("(seed)");
  });

  it("追加すると、メールは小文字に正規化され、重複しない", async () => {
    const t = setup();
    const a = await t.call("POST", "/admins", { admin: true, body: { email: "  New@Example.com " } });
    expect(a.statusCode).toBe(201);
    expect(a.json.email).toBe("new@example.com");
    await t.call("POST", "/admins", { admin: true, body: { email: "new@example.com" } });
    const list = (await t.call("GET", "/admins", { admin: true })).json.admins;
    expect(list).toHaveLength(2);
  });

  it("形式が正しくないメールは400", async () => {
    const t = setup();
    for (const email of ["", "abc", "a@b", 12, undefined]) {
      expect((await t.call("POST", "/admins", { admin: true, body: { email } })).statusCode).toBe(400);
    }
  });

  it("削除でき、最後の1人は削除できない", async () => {
    const t = setup();
    await t.call("POST", "/admins", { admin: true, body: { email: "second@example.com" } });
    const del = await t.call("DELETE", `/admins/${encodeURIComponent("second@example.com")}`, { admin: true });
    expect(del.statusCode).toBe(200);
    const last = await t.call("DELETE", `/admins/${encodeURIComponent(SEED)}`, { admin: true });
    expect(last.statusCode).toBe(400);
    expect(last.json.error.code ?? last.json.code).toBe("last_admin");
    expect((await t.call("DELETE", "/admins/nobody%40example.com", { admin: true })).statusCode).toBe(404);
  });

  it("一度登録されたあとは、環境変数を変えても一覧は戻らない", async () => {
    const t = setup();
    await t.call("POST", "/admins", { admin: true, body: { email: "second@example.com" } });
    await t.call("DELETE", `/admins/${encodeURIComponent(SEED)}`, { admin: true });
    const list = (await t.call("GET", "/admins", { admin: true })).json.admins;
    expect(list.map((a: { email: string }) => a.email)).toEqual(["second@example.com"]);
  });

  it("認証なしは401", async () => {
    const t = setup();
    expect((await t.call("GET", "/admins")).statusCode).toBe(401);
  });
});
