import { describe, expect, it } from "vitest";
import { createTestApp, newSubmissionId } from "./helpers.js";

const VOTER_A = "voter-aaaaaaaaaaaaaaaaaaaaaa";
const VOTER_B = "voter-bbbbbbbbbbbbbbbbbbbbbb";

describe("いいね(API)", () => {
  async function setup() {
    const t = createTestApp();
    const { sessionId } = await t.openSession();
    const post = async (body: string) =>
      (await t.call("POST", `/sessions/${sessionId}/opinions`, { body: { submissionId: newSubmissionId(), body, kind: "idea" } })).json.opinion.id as string;
    const react = (id: string, voterId: string, reacted = true) =>
      t.call("POST", `/opinions/${id}/reaction`, { body: { voterId, reacted } });
    const counts = async (admin = false) =>
      Object.fromEntries(
        ((await t.call("GET", `/sessions/${sessionId}/opinions`, admin ? { admin: true } : {})).json.opinions as { id: string; reactionCount: number }[]).map((o) => [o.id, o.reactionCount]),
      );
    return { ...t, sessionId, post, react, counts };
  }

  it("付けると数が増え、一覧に出る。参加者にも運営者にも同じ数が見える", async () => {
    const t = await setup();
    const a = await t.post("意見A");
    const b = await t.post("意見B");
    expect((await t.react(a, VOTER_A)).json).toEqual({ reacted: true, count: 1 });
    expect((await t.react(a, VOTER_B)).json).toEqual({ reacted: true, count: 2 });
    expect(await t.counts()).toEqual({ [a]: 2, [b]: 0 });
    expect(await t.counts(true)).toEqual({ [a]: 2, [b]: 0 });
  });

  it("同じ投票者の二重投票は、数えない。外すと減る", async () => {
    const t = await setup();
    const a = await t.post("意見A");
    await t.react(a, VOTER_A);
    expect((await t.react(a, VOTER_A)).json.count).toBe(1);
    expect((await t.react(a, VOTER_A, false)).json).toEqual({ reacted: false, count: 0 });
    expect((await t.react(a, VOTER_A, false)).json.count).toBe(0);
  });

  it("投票者のIDそのものは保存せず、不正な形式は400", async () => {
    const t = await setup();
    const a = await t.post("意見A");
    expect((await t.react(a, "short")).statusCode).toBe(400);
    expect((await t.call("POST", `/opinions/${a}/reaction`, { body: { voterId: VOTER_A } })).statusCode).toBe(400);
  });

  it("非表示・削除された投稿や、存在しない投稿には付けられない", async () => {
    const t = await setup();
    const a = await t.post("意見A");
    await t.call("POST", `/opinions/${a}/moderation`, { admin: true, body: { status: "hidden" } });
    expect((await t.react(a, VOTER_A)).statusCode).toBe(404);
    expect((await t.react("nope", VOTER_A)).statusCode).toBe(404);
  });

  it("受け付けを終えたセッションには付けられない", async () => {
    const t = await setup();
    const a = await t.post("意見A");
    await t.call("PATCH", `/sessions/${t.sessionId}`, { admin: true, body: { status: "closed" } });
    const res = await t.react(a, VOTER_A);
    expect(res.statusCode).toBe(403);
    expect(res.json.error.code).toBe("not_accepting");
  });

  it("投稿の並び順は、いいねの数に左右されない(少数意見が埋もれない)", async () => {
    const t = await setup();
    const a = await t.post("意見A");
    const b = await t.post("意見B");
    await t.react(b, VOTER_A);
    await t.react(b, VOTER_B);
    const ids = (await t.call("GET", `/sessions/${t.sessionId}/opinions`)).json.opinions.map((o: { id: string }) => o.id);
    expect(ids).toEqual([a, b]);
  });
});
