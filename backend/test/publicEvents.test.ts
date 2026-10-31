import { describe, expect, it } from "vitest";
import { MAX_PUBLIC_EVENTS } from "../../core/src/services/opinionService.js";
import { createTestApp, newSubmissionId } from "./helpers.js";

describe("公開中のイベントの一覧(招待なし)", () => {
  async function create(t: ReturnType<typeof createTestApp>, name: string, status: "draft" | "active" | "archived" = "active", description = "") {
    const event = (await t.call("POST", "/events", { admin: true, body: { name, description } })).json;
    if (status !== "draft") await t.call("PATCH", `/events/${event.id}`, { admin: true, body: { status } });
    return event.id as string;
  }
  const list = async (t: ReturnType<typeof createTestApp>) =>
    (await t.call("GET", "/public/events")).json.events as { id: string; name: string; description: string }[];

  it("認証なしで、公開中(active)のイベントだけを、名前と説明つきで返す。新しい順", async () => {
    const t = createTestApp();
    const a = await create(t, "古いイベント", "active", "説明A");
    await create(t, "下書きのイベント", "draft");
    await create(t, "終了したイベント", "archived");
    const b = await create(t, "新しいイベント");
    const res = await t.call("GET", "/public/events");
    expect(res.statusCode).toBe(200);
    expect(res.json.events).toEqual([
      { id: b, name: "新しいイベント", description: "" },
      { id: a, name: "古いイベント", description: "説明A" },
    ]);
  });

  it("作成者や状態など、名前と説明のほかは、返さない", async () => {
    const t = createTestApp();
    await create(t, "公開のイベント");
    const body = (await t.call("GET", "/public/events")).body;
    expect(body).not.toContain("createdBy");
    expect(body).not.toContain("(token)");
    expect(body).not.toContain("status");
    expect(Object.keys((await list(t))[0]!).sort()).toEqual(["description", "id", "name"]);
  });

  it("公開中のイベントが無ければ、空の一覧", async () => {
    const t = createTestApp();
    await create(t, "下書きだけ", "draft");
    expect(await list(t)).toEqual([]);
  });

  it("一覧の数に、上限がある(新しい順に、上限まで)", async () => {
    const t = createTestApp();
    for (let i = 0; i < MAX_PUBLIC_EVENTS + 3; i++) await create(t, `イベント${i}`);
    const events = await list(t);
    expect(events).toHaveLength(MAX_PUBLIC_EVENTS);
    expect(events[0]?.name).toBe(`イベント${MAX_PUBLIC_EVENTS + 2}`);
  });

  it("公開をやめる(下書きや終了にする)と、一覧から消える", async () => {
    const t = createTestApp();
    const id = await create(t, "いまだけ公開");
    expect(await list(t)).toHaveLength(1);
    await t.call("PATCH", `/events/${id}`, { admin: true, body: { status: "archived" } });
    expect(await list(t)).toEqual([]);
  });

  it("不審な投稿が続くときは、テーマをすべて閉じると、投稿できなくなる(閲覧はできる)", async () => {
    const t = createTestApp();
    const { eventId, sessionId } = await t.openSession();
    const post = () =>
      t.call("POST", `/sessions/${sessionId}/opinions`, { body: { submissionId: newSubmissionId(), body: "意見", kind: "idea" } });
    // 公開中のイベントは、一覧に出て、誰でも投稿できる
    expect((await list(t)).map((e) => e.id)).toContain(eventId);
    expect((await post()).statusCode).toBe(201);
    // すべて閉じる
    await t.call("PATCH", `/events/${eventId}`, { admin: true, body: { openSessionIds: [] } });
    const denied = await post();
    expect(denied.statusCode).toBe(403);
    expect(denied.json.error.code).toBe("not_accepting");
    // 一覧には残り、意見は見られる
    expect((await list(t)).map((e) => e.id)).toContain(eventId);
    expect((await t.call("GET", `/sessions/${sessionId}/opinions`)).statusCode).toBe(200);
  });
});
