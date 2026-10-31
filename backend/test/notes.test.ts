import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.js";

describe("議論の記録(OST・API)", () => {
  async function setup() {
    const t = createTestApp();
    const event = (await t.call("POST", "/events", { admin: true, body: { name: "OST" } })).json;
    await t.call("PATCH", `/events/${event.id}`, { admin: true, body: { status: "active" } });
    const make = async (title: string, status = "active") => {
      const s = (await t.call("POST", `/events/${event.id}/sessions`, { admin: true, body: { title, prompt: `${title}の問い` } })).json;
      await t.call("PATCH", `/sessions/${s.id}`, { admin: true, body: { status } });
      return s.id as string;
    };
    const a = await make("場A");
    const b = await make("場B");
    const draft = await make("下書き", "draft");
    const save = (id: string, body: Record<string, unknown>) => t.call("PUT", `/sessions/${id}/notes`, { admin: true, body });
    const list = (admin = false) => t.call("GET", `/events/${event.id}/notes`, admin ? { admin: true } : {});
    return { ...t, eventId: event.id as string, a, b, draft, save, list };
  }

  const NOTES = {
    conclusion: "朝会を15分にそろえる",
    nextActions: [{ text: "カレンダーを更新する", owner: "進行役" }, { text: "   ", owner: "" }],
    openQuestions: ["遅刻者への共有はどうする？", ""],
  };

  it("記録を保存でき、運営者はすべて見られる。空の項目は落とす", async () => {
    const t = await setup();
    const res = await t.save(t.a, NOTES);
    expect(res.statusCode).toBe(200);
    expect(res.json.published).toBe(false);
    expect(res.json.notes.nextActions).toEqual([{ text: "カレンダーを更新する", owner: "進行役" }]);
    expect(res.json.notes.openQuestions).toEqual(["遅刻者への共有はどうする？"]);
    const admin = (await t.list(true)).json.notes;
    expect(admin.map((n: { title: string }) => n.title)).toEqual(["場A"]);
    expect(admin[0].published).toBe(false);
  });

  it("参加者には、公開した記録だけが見える。公開前は、APIにも出ない", async () => {
    const t = await setup();
    await t.save(t.a, NOTES);
    await t.save(t.b, { ...NOTES, conclusion: "公開する結論", published: true });
    const shown = (await t.list()).json.notes;
    expect(shown.map((n: { title: string }) => n.title)).toEqual(["場B"]);
    const body = (await t.list()).body;
    expect(body).not.toContain("朝会を15分にそろえる");
  });

  it("公開をやめると、参加者から見えなくなる。下書きのテーマは出さない", async () => {
    const t = await setup();
    await t.save(t.b, { ...NOTES, published: true });
    await t.save(t.b, { ...NOTES, published: false });
    expect((await t.list()).json.notes).toHaveLength(0);
    await t.save(t.draft, { ...NOTES, published: true });
    expect((await t.list()).json.notes).toHaveLength(0);
  });

  it("テーマの公開情報には、記録が含まれない", async () => {
    const t = await setup();
    await t.save(t.a, { ...NOTES, published: true });
    expect((await t.call("GET", `/sessions/${t.a}`)).body).not.toContain("朝会");
    expect((await t.call("GET", `/events/${t.eventId}/public`)).body).not.toContain("朝会");
  });

  it("保存は運営者だけ。担当のイベントの運営者のリンクは使える。認証なしは401", async () => {
    const t = await setup();
    expect((await t.call("PUT", `/sessions/${t.a}/notes`, { body: NOTES })).statusCode).toBe(401);
    const issued = (await t.call("POST", `/events/${t.eventId}/operator-tokens`, { admin: true, body: { label: "書記" } })).json;
    const headers = { authorization: `Bearer ${issued.token}` };
    expect((await t.call("PUT", `/sessions/${t.a}/notes`, { headers, body: NOTES })).statusCode).toBe(200);
    const other = await t.openSession();
    expect((await t.call("PUT", `/sessions/${other.sessionId}/notes`, { headers, body: NOTES })).statusCode).toBe(403);
  });

  it("入力の検証: 長さ、件数、型", async () => {
    const t = await setup();
    expect((await t.save(t.a, { conclusion: "あ".repeat(1001) })).statusCode).toBe(400);
    expect((await t.save(t.a, { nextActions: Array.from({ length: 21 }, () => ({ text: "x", owner: "" })) })).statusCode).toBe(400);
    expect((await t.save(t.a, { nextActions: [{ text: "x", owner: "あ".repeat(51) }] })).statusCode).toBe(400);
    expect((await t.save(t.a, { openQuestions: [1] })).statusCode).toBe(400);
    expect((await t.save(t.a, { published: "yes" })).statusCode).toBe(400);
    expect((await t.save("nope", NOTES)).statusCode).toBe(404);
  });
});
