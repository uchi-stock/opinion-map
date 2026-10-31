import type { EventRecord, ProposalRecord, SessionRecord } from "../domain/types.js";
import { PROMPT_MAX_LENGTH, charLength, type ProposalDecision, type ProposalInput } from "../domain/validation.js";
import { AppError, forbidden, notFound } from "../lib/errors.js";
import { sha256Hex } from "../lib/hash.js";
import type { ServiceContext } from "./context.js";

/** 提案に付く、いいねの数を含めた形 */
export interface ProposalView {
  id: string;
  title: string;
  description: string;
  status: ProposalRecord["status"];
  /** 承認でできたテーマ、または統合先のテーマ */
  sessionId?: string;
  reactionCount: number;
  createdAt: string;
}

/** 受け付ける提案の数の上限(承認待ち)と、短時間の頻度の上限。誰が出したかは見ず、全体の量だけを抑える */
export const MAX_PENDING_PROPOSALS = 100;
export const PROPOSAL_RATE = { max: 30, windowSeconds: 60 };

/** 提案へのいいねは、投稿へのいいねと同じ保存先を使う。提案の集まりを、イベントごとの範囲で示す */
const reactionScope = (eventId: string) => `event:${eventId}`;

export function createProposalService(ctx: ServiceContext) {
  async function loadEvent(eventId: string, { forParticipant }: { forParticipant: boolean }): Promise<EventRecord> {
    const event = await ctx.repos.events.get(eventId);
    if (!event || (forParticipant && event.status === "draft")) throw notFound("イベント");
    return event;
  }

  async function views(event: EventRecord, list: ProposalRecord[]): Promise<ProposalView[]> {
    const counts = new Map<string, number>();
    for (const r of await ctx.repos.reactions.listBySession(reactionScope(event.id))) {
      counts.set(r.opinionId, (counts.get(r.opinionId) ?? 0) + 1);
    }
    return list.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      status: p.status,
      ...(p.sessionId ? { sessionId: p.sessionId } : {}),
      reactionCount: counts.get(p.id) ?? 0,
      createdAt: p.createdAt,
    }));
  }

  /** 参加者に見せてよい提案か。承認済みは見せる。承認前は、設定があるときだけ。却下・統合は見せない */
  const visibleToParticipants = (event: EventRecord, p: ProposalRecord) =>
    p.status === "approved" || (p.status === "pending" && event.showPendingProposals === true);

  return {
    /** 同じ送信IDなら、新しく作らず既存の提案を返す */
    async submit(eventId: string, input: ProposalInput): Promise<{ proposal: ProposalView; created: boolean }> {
      const event = await loadEvent(eventId, { forParticipant: true });
      if (event.status !== "active" || event.acceptingProposals !== true) {
        throw forbidden("not_accepting_proposals", "このイベントは、いま議題の提案を受け付けていません");
      }
      const all = await ctx.repos.proposals.listByEvent(eventId);
      const existing = all.find((p) => p.submissionId === input.submissionId);
      if (existing) return { proposal: (await views(event, [existing]))[0]!, created: false };
      const since = new Date(ctx.now().getTime() - PROPOSAL_RATE.windowSeconds * 1000).toISOString();
      if (all.filter((p) => p.createdAt >= since).length >= PROPOSAL_RATE.max) {
        throw new AppError(429, "rate_limited", "提案が集中しています。少し待ってから、もう一度送ってください");
      }
      if (all.filter((p) => p.status === "pending").length >= MAX_PENDING_PROPOSALS) {
        throw new AppError(429, "too_many_pending", "承認待ちの提案が多すぎます。運営者の確認をお待ちください");
      }
      const at = ctx.now().toISOString();
      const record: ProposalRecord = {
        id: ctx.newId(),
        eventId,
        submissionId: input.submissionId,
        title: input.title,
        description: input.description,
        status: "pending",
        createdAt: at,
        updatedAt: at,
      };
      await ctx.repos.proposals.create(record);
      return { proposal: (await views(event, [record]))[0]!, created: true };
    },

    async listForParticipant(eventId: string): Promise<{ accepting: boolean; proposals: ProposalView[] }> {
      const event = await loadEvent(eventId, { forParticipant: true });
      const list = (await ctx.repos.proposals.listByEvent(eventId)).filter((p) => visibleToParticipants(event, p));
      return { accepting: event.status === "active" && event.acceptingProposals === true, proposals: await views(event, list) };
    },

    async listForAdmin(eventId: string): Promise<ProposalView[]> {
      const event = await loadEvent(eventId, { forParticipant: false });
      return views(event, await ctx.repos.proposals.listByEvent(eventId));
    },

    /** 提案へのいいね。参加者に見える提案だけ。イベントが公開中のときだけ */
    async react(proposalId: string, voterId: string, reacted: boolean): Promise<{ reacted: boolean; count: number }> {
      const proposal = await ctx.repos.proposals.get(proposalId);
      if (!proposal) throw notFound("提案");
      const event = await loadEvent(proposal.eventId, { forParticipant: true });
      if (!visibleToParticipants(event, proposal)) throw notFound("提案");
      if (event.status !== "active") throw forbidden("not_accepting", "このイベントは、いま投票を受け付けていません");
      const voterHash = await sha256Hex(voterId);
      if (reacted) {
        await ctx.repos.reactions.add({
          sessionId: reactionScope(event.id),
          opinionId: proposalId,
          voterHash,
          createdAt: ctx.now().toISOString(),
        });
      } else {
        await ctx.repos.reactions.remove(proposalId, voterHash);
      }
      const count = (await ctx.repos.reactions.listBySession(reactionScope(event.id))).filter((r) => r.opinionId === proposalId).length;
      return { reacted, count };
    },

    /**
     * 承認(テーマを作って開く)・却下・統合。承認前の提案だけが対象。
     * 承認でできるテーマは公開中で、開くテーマを選んでいるイベントでは、そのテーマも開く
     */
    async decide(proposalId: string, decision: ProposalDecision): Promise<{ proposal: ProposalView; session?: SessionRecord }> {
      const proposal = await ctx.repos.proposals.get(proposalId);
      if (!proposal) throw notFound("提案");
      const event = await loadEvent(proposal.eventId, { forParticipant: false });
      if (proposal.status !== "pending") {
        throw new AppError(409, "already_decided", "この提案は、すでに判断済みです");
      }
      const at = ctx.now().toISOString();
      let next: ProposalRecord = { ...proposal, status: decision.status, updatedAt: at };
      let session: SessionRecord | undefined;
      if (decision.status === "approved") {
        const prompt = proposal.description !== "" ? proposal.description : proposal.title;
        session = {
          id: ctx.newId(),
          eventId: event.id,
          title: proposal.title,
          prompt: charLength(prompt) > PROMPT_MAX_LENGTH ? Array.from(prompt).slice(0, PROMPT_MAX_LENGTH).join("") : prompt,
          format: "ost",
          status: "active",
          showOpinionsToParticipants: true,
          createdAt: at,
          updatedAt: at,
        };
        await ctx.repos.sessions.create(session);
        next = { ...next, sessionId: session.id };
        // 開くテーマを選んでいるイベントでは、できたテーマも開く
        const selected = event.openSessionIds ?? (event.currentSessionId ? [event.currentSessionId] : undefined);
        if (selected !== undefined) {
          const { currentSessionId: _legacy, ...rest } = event;
          await ctx.repos.events.update({ ...rest, openSessionIds: [...selected, session.id], updatedAt: at });
        }
      } else if (decision.status === "merged") {
        const target = await ctx.repos.sessions.get(decision.intoSessionId);
        if (!target || target.eventId !== event.id) throw notFound("統合先のテーマ");
        next = { ...next, sessionId: target.id };
      }
      await ctx.repos.proposals.update(next);
      return { proposal: (await views(event, [next]))[0]!, ...(session ? { session } : {}) };
    },

    async eventIdOf(proposalId: string): Promise<string | undefined> {
      return (await ctx.repos.proposals.get(proposalId))?.eventId;
    },
  };
}
export type ProposalService = ReturnType<typeof createProposalService>;
