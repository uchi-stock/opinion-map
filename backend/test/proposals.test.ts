import { describe, expect, it } from "vitest";
import { createTestApp, newSubmissionId } from "./helpers.js";

const VOTER = "voter-aaaaaaaaaaaaaaaaaaaaaa";

describe("議題の提案(OST・API)", () => {
  async function setup() {
    const t = createTestApp();
    const event = (await t.call("POST", "/events", { admin: true, body: { name: "OST" } })).json;
    await t.call("PATCH", `/events/${event.id}`, { admin: true, body: { status: "active" } });
    const settings = (body: Record<string, unknown>) =>
      t.call("PATCH", `/events/${event.id}`, { admin: true, body });
    const propose = (title = "新しい議題", description = "", submissionId = newSubmissionId()) =>
      t.call("POST", `/events/${event.id}/proposals`, { body: { submissionId, title, description } });
    const list = (admin = false) =>
      t.call("GET", `/events/${event.id}/proposals`, admin ? { admin: true } : {});
    const decide = (id: string, body: Record<string, unknown>) =>
      t.call("POST", `/proposals/${id}/decision`, { admin: true, body });
    return { ...t, eventId: event.id as string, settings, propose, list, decide };
  }

  it("既定では、提案を受け付けない。設定すると受け付ける", async () => {
    const t = await setup();
    const denied = await t.propose();
    expect(denied.statusCode).toBe(403);
    expect(denied.json.error.code).toBe("not_accepting_proposals");
    await t.settings({ acceptingProposals: true });
    expect((await t.propose()).statusCode).toBe(201);
  });

  it("下書きのイベントは、存在しないものとして扱う", async () => {
    const t = createTestApp();
    const event = (await t.call("POST", "/events", { admin: true, body: { name: "準備中" } })).json;
    const res = await t.call("POST", `/events/${event.id}/proposals`, { body: { submissionId: newSubmissionId(), title: "x" } });
    expect(res.statusCode).toBe(404);
  });

  it("同じ送信IDは、新しく作らない。入力の検証もする", async () => {
    const t = await setup();
    await t.settings({ acceptingProposals: true });
    const id = newSubmissionId();
    const first = await t.propose("議題A", "", id);
    const again = await t.propose("議題A", "", id);
    expect(again.statusCode).toBe(200);
    expect(again.json.duplicate).toBe(true);
    expect(again.json.proposal.id).toBe(first.json.proposal.id);
    expect((await t.propose("")).statusCode).toBe(400);
    expect((await t.propose("あ".repeat(51))).statusCode).toBe(400);
    expect((await t.call("POST", `/events/${t.eventId}/proposals`, { body: { title: "x" } })).statusCode).toBe(400);
  });

  it("承認前の提案は、既定では参加者に見せない。設定すると見せる。運営者は常にすべて見える", async () => {
    const t = await setup();
    await t.settings({ acceptingProposals: true });
    await t.propose("議題A");
    expect((await t.list()).json.proposals).toHaveLength(0);
    expect((await t.list(true)).json.proposals).toHaveLength(1);
    await t.settings({ showPendingProposals: true });
    const shown = (await t.list()).json;
    expect(shown.proposals.map((p: { title: string }) => p.title)).toEqual(["議題A"]);
    expect(shown.accepting).toBe(true);
    // 提案者を示す情報は、どこにも出ない
    expect(Object.keys(shown.proposals[0]).sort()).toEqual(["createdAt", "description", "id", "reactionCount", "status", "title"]);
  });

  it("承認すると、公開中のテーマができる。開くテーマを選んでいるイベントでは、そのテーマも開く", async () => {
    const t = await setup();
    await t.settings({ acceptingProposals: true });
    const existing = (await t.call("POST", `/events/${t.eventId}/sessions`, { admin: true, body: { title: "既存", prompt: "問い" } })).json;
    await t.call("PATCH", `/sessions/${existing.id}`, { admin: true, body: { status: "active" } });
    await t.settings({ openSessionIds: [existing.id] });
    const proposal = (await t.propose("朝の議題", "朝に話したいこと")).json.proposal;
    const decided = await t.decide(proposal.id, { status: "approved" });
    expect(decided.statusCode).toBe(200);
    expect(decided.json.proposal.status).toBe("approved");
    const session = decided.json.session;
    expect(session).toMatchObject({ title: "朝の議題", prompt: "朝に話したいこと", format: "ost", status: "active" });
    expect(decided.json.proposal.sessionId).toBe(session.id);
    const info = (await t.call("GET", `/events/${t.eventId}/public`)).json;
    expect(info.openSessionIds).toEqual([existing.id, session.id]);
    // 参加者の一覧に、承認済みとして出る
    expect((await t.list()).json.proposals.map((p: { status: string }) => p.status)).toEqual(["approved"]);
    // 承認したテーマに、投稿できる
    const posted = await t.call("POST", `/sessions/${session.id}/opinions`, { body: { submissionId: newSubmissionId(), body: "意見", kind: "idea" } });
    expect(posted.statusCode).toBe(201);
  });

  it("却下・統合した提案は、参加者に見せない。判断済みは、変えられない", async () => {
    const t = await setup();
    await t.settings({ acceptingProposals: true, showPendingProposals: true });
    const target = (await t.call("POST", `/events/${t.eventId}/sessions`, { admin: true, body: { title: "統合先", prompt: "問い" } })).json;
    const a = (await t.propose("却下する")).json.proposal;
    const b = (await t.propose("統合する")).json.proposal;
    expect((await t.decide(a.id, { status: "rejected" })).statusCode).toBe(200);
    const merged = await t.decide(b.id, { status: "merged", intoSessionId: target.id });
    expect(merged.json.proposal.sessionId).toBe(target.id);
    expect((await t.list()).json.proposals).toHaveLength(0);
    expect((await t.list(true)).json.proposals.map((p: { status: string }) => p.status)).toEqual(["rejected", "merged"]);
    const again = await t.decide(a.id, { status: "approved" });
    expect(again.statusCode).toBe(409);
    expect(again.json.error.code).toBe("already_decided");
  });

  it("統合先は、同じイベントのテーマだけ。指定が不正なら400", async () => {
    const t = await setup();
    await t.settings({ acceptingProposals: true });
    const p = (await t.propose()).json.proposal;
    const other = await t.openSession();
    expect((await t.decide(p.id, { status: "merged", intoSessionId: other.sessionId })).statusCode).toBe(404);
    expect((await t.decide(p.id, { status: "merged" })).statusCode).toBe(400);
    expect((await t.decide(p.id, { status: "weird" })).statusCode).toBe(400);
  });

  it("提案にいいねを付けられる。二重投票は数えない。見えない提案には付けられない", async () => {
    const t = await setup();
    await t.settings({ acceptingProposals: true, showPendingProposals: true });
    const p = (await t.propose()).json.proposal;
    const react = (id: string, reacted = true) =>
      t.call("POST", `/proposals/${id}/reaction`, { body: { voterId: VOTER, reacted } });
    expect((await react(p.id)).json).toEqual({ reacted: true, count: 1 });
    expect((await react(p.id)).json.count).toBe(1);
    expect((await t.list()).json.proposals[0].reactionCount).toBe(1);
    expect((await react(p.id, false)).json.count).toBe(0);
    await t.decide(p.id, { status: "rejected" });
    expect((await react(p.id)).statusCode).toBe(404);
    expect((await react("nope")).statusCode).toBe(404);
  });

  it("判断は運営者だけ。担当のイベントの運営者のリンクは使える。認証なしは401", async () => {
    const t = await setup();
    await t.settings({ acceptingProposals: true });
    const p = (await t.propose()).json.proposal;
    expect((await t.call("POST", `/proposals/${p.id}/decision`, { body: { status: "approved" } })).statusCode).toBe(401);
    const issued = (await t.call("POST", `/events/${t.eventId}/operator-tokens`, { admin: true, body: { label: "進行" } })).json;
    const res = await t.call("POST", `/proposals/${p.id}/decision`, {
      headers: { authorization: `Bearer ${issued.token}` },
      body: { status: "rejected" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("承認待ちが上限に達すると、受け付けない", async () => {
    const t = await setup();
    await t.settings({ acceptingProposals: true });
    // 時刻が進む(テストの時計)ので、頻度の上限には触れず、承認待ちの上限だけを確かめる
    let last = 201;
    for (let i = 0; i < 100; i++) {
      const res = await t.propose(`議題${i}`);
      last = res.statusCode;
      if (last !== 201) break;
    }
    expect(last).toBe(201);
    const over = await t.propose("あふれる");
    expect(over.statusCode).toBe(429);
  });
});
