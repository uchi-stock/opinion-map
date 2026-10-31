import { toPublicOpinion, type EventRecord, type OpinionRecord, type PublicOpinion, type SessionRecord } from "../domain/types.js";
import type { OpinionInput } from "../domain/validation.js";
import { AppError, forbidden, notFound } from "../lib/errors.js";
import { safeEqual } from "../lib/auth.js";
import { sha256Hex } from "../lib/hash.js";
import type { OpinionEdit } from "../domain/validation.js";
import type { ServiceContext } from "./context.js";

export interface PublicSession {
  id: string;
  title: string;
  prompt: string;
  format: SessionRecord["format"];
  status: SessionRecord["status"];
  eventName: string;
  acceptingOpinions: boolean;
  showOpinions: boolean;
}

function isAccepting(event: EventRecord, session: SessionRecord): boolean {
  return event.status === "active" && session.status === "active";
}

/** 1つのセッションが、一定時間に受け付ける投稿の数。誰が書いたかは見ず、全体の量だけを抑える */
export interface OpinionRateLimit {
  max: number;
  windowSeconds: number;
}
export const DEFAULT_RATE_LIMIT: OpinionRateLimit = { max: 120, windowSeconds: 60 };

/** 運営者が付けられる状態 */
export type ModerationStatus = "active" | "hidden" | "deleted";

/** 運営者向けの投稿。非表示かどうかを含む */
export interface AdminOpinion extends PublicOpinion {
  status: "active" | "hidden";
}

export const DELETED_BODY_PLACEHOLDER = "";

export function createOpinionService(ctx: ServiceContext, rateLimit: OpinionRateLimit = DEFAULT_RATE_LIMIT) {
  /** 投稿ごとのいいねの数 */
  async function reactionCounts(sessionId: string): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const r of await ctx.repos.reactions.listBySession(sessionId)) {
      counts.set(r.opinionId, (counts.get(r.opinionId) ?? 0) + 1);
    }
    return counts;
  }

  const withCount = (o: PublicOpinion, counts: Map<string, number>): PublicOpinion => ({
    ...o,
    reactionCount: counts.get(o.id) ?? 0,
  });

  /** 削除した投稿の本文を、過去の分析の入力の記録からも消す */
  async function scrubFromAnalyses(sessionId: string, opinionId: string): Promise<void> {
    for (const run of await ctx.repos.analyses.listBySession(sessionId)) {
      if (!run.input.opinions.some((o) => o.id === opinionId)) continue;
      await ctx.repos.analyses.update({
        ...run,
        input: {
          ...run.input,
          opinions: run.input.opinions.map((o) => (o.id === opinionId ? { ...o, body: DELETED_BODY_PLACEHOLDER } : o)),
        },
      });
    }
  }

  async function erase(opinion: OpinionRecord): Promise<OpinionRecord> {
    const next: OpinionRecord = { ...opinion, status: "deleted", body: DELETED_BODY_PLACEHOLDER, updatedAt: ctx.now().toISOString() };
    delete next.editKeyHash;
    await ctx.repos.opinions.update(next);
    await scrubFromAnalyses(opinion.sessionId, opinion.id);
    return next;
  }

  /** 鍵が合う、公開中の投稿を返す。存在しない場合も同じエラーにして、IDの存在を教えない */
  async function authorize(id: string, editKey: string): Promise<OpinionRecord> {
    const opinion = await ctx.repos.opinions.get(id);
    const denied = forbidden("invalid_edit_key", "編集用の鍵が合いません");
    if (!opinion || opinion.status === "deleted" || !opinion.editKeyHash) throw denied;
    if (!safeEqual(await sha256Hex(editKey), opinion.editKeyHash)) throw denied;
    return opinion;
  }

  /** 下書きのイベント・セッションは、参加者には存在しないものとして扱う */
  async function loadForParticipant(sessionId: string): Promise<{ event: EventRecord; session: SessionRecord }> {
    const session = await ctx.repos.sessions.get(sessionId);
    if (!session) throw notFound("セッション");
    const event = await ctx.repos.events.get(session.eventId);
    if (!event || event.status === "draft" || session.status === "draft") throw notFound("セッション");
    return { event, session };
  }

  return {
    async getPublicSession(sessionId: string): Promise<PublicSession> {
      const { event, session } = await loadForParticipant(sessionId);
      return {
        id: session.id,
        title: session.title,
        prompt: session.prompt,
        format: session.format,
        status: session.status,
        eventName: event.name,
        acceptingOpinions: isAccepting(event, session),
        showOpinions: session.showOpinionsToParticipants,
      };
    },

    /** 同じ送信IDなら、新しく作らず既存の投稿を返す */
    async submit(sessionId: string, input: OpinionInput): Promise<{ opinion: PublicOpinion; created: boolean }> {
      const { event, session } = await loadForParticipant(sessionId);
      if (!isAccepting(event, session)) {
        throw forbidden("not_accepting", "このセッションは、いま投稿を受け付けていません");
      }
      // 再送(同じ送信ID)は、頻度の制限の対象にしない
      if (!(await ctx.repos.opinions.findBySubmission(sessionId, input.submissionId))) {
        const since = new Date(ctx.now().getTime() - rateLimit.windowSeconds * 1000).toISOString();
        if ((await ctx.repos.opinions.countCreatedSince(sessionId, since)) >= rateLimit.max) {
          throw new AppError(429, "rate_limited", "投稿が集中しています。少し待ってから、もう一度送ってください");
        }
      }
      const at = ctx.now().toISOString();
      const record: OpinionRecord = {
        id: ctx.newId(),
        sessionId,
        submissionId: input.submissionId,
        body: input.body,
        kind: input.kind,
        status: "active",
        ...(input.editKey ? { editKeyHash: await sha256Hex(input.editKey) } : {}),
        createdAt: at,
        updatedAt: at,
      };
      const result = await ctx.repos.opinions.createIfAbsent(record);
      return { opinion: toPublicOpinion(result.opinion), created: result.created };
    },

    /** 参加者向けの一覧。非表示の設定なら、空を返す */
    async listForParticipant(sessionId: string): Promise<{ hidden: boolean; opinions: PublicOpinion[] }> {
      const { session } = await loadForParticipant(sessionId);
      if (!session.showOpinionsToParticipants) return { hidden: true, opinions: [] };
      const list = await ctx.repos.opinions.listBySession(sessionId);
      const counts = await reactionCounts(sessionId);
      return { hidden: false, opinions: list.map((o) => withCount(toPublicOpinion(o), counts)) };
    },

    /**
     * いいねを付ける・外す。同じ投票者は、同じ投稿に1回だけ付けられる(再送は無害)。
     * 受け付け中で、公開中の投稿だけ。投票者は、IDのハッシュだけを保存する。
     */
    async react(opinionId: string, voterId: string, reacted: boolean): Promise<{ reacted: boolean; count: number }> {
      const opinion = await ctx.repos.opinions.get(opinionId);
      if (!opinion || opinion.status !== "active") throw notFound("投稿");
      const { event, session } = await loadForParticipant(opinion.sessionId);
      if (!session.showOpinionsToParticipants) throw notFound("投稿");
      if (!isAccepting(event, session)) {
        throw forbidden("not_accepting", "このセッションは、いま投票を受け付けていません");
      }
      const voterHash = await sha256Hex(voterId);
      if (reacted) {
        await ctx.repos.reactions.add({
          sessionId: opinion.sessionId,
          opinionId,
          voterHash,
          createdAt: ctx.now().toISOString(),
        });
      } else {
        await ctx.repos.reactions.remove(opinionId, voterHash);
      }
      const counts = await reactionCounts(opinion.sessionId);
      return { reacted, count: counts.get(opinionId) ?? 0 };
    },

    /** 運営者向けの一覧。設定にかかわらず、非表示のものも含めて返す */
    async listForAdmin(sessionId: string): Promise<AdminOpinion[]> {
      const session = await ctx.repos.sessions.get(sessionId);
      if (!session) throw notFound("セッション");
      const list = await ctx.repos.opinions.listManageableBySession(sessionId);
      const counts = await reactionCounts(sessionId);
      return list.map((o) => ({ ...withCount(toPublicOpinion(o), counts), status: o.status === "hidden" ? "hidden" : "active" }));
    },

    /** 投稿者による編集。受け付け中のセッションだけ。分析の入力の記録は変えない */
    async edit(id: string, input: OpinionEdit): Promise<PublicOpinion> {
      const opinion = await authorize(id, input.editKey);
      const { event, session } = await loadForParticipant(opinion.sessionId);
      if (!isAccepting(event, session)) {
        throw forbidden("not_accepting", "このセッションは、いま投稿を受け付けていません");
      }
      const next: OpinionRecord = {
        ...opinion,
        body: input.body,
        kind: input.kind ?? opinion.kind,
        updatedAt: ctx.now().toISOString(),
      };
      await ctx.repos.opinions.update(next);
      return toPublicOpinion(next);
    },

    /** 投稿者による削除。セッションの状態にかかわらず、できる */
    async deleteByAuthor(id: string, editKey: string): Promise<void> {
      await erase(await authorize(id, editKey));
    },

    /** 運営者による、非表示・再表示・削除。削除は元に戻せない */
    async moderate(id: string, status: ModerationStatus): Promise<{ id: string; status: ModerationStatus }> {
      const opinion = await ctx.repos.opinions.get(id);
      if (!opinion || opinion.status === "deleted") throw notFound("投稿");
      if (status === "deleted") {
        await erase(opinion);
      } else {
        await ctx.repos.opinions.update({ ...opinion, status, updatedAt: ctx.now().toISOString() });
      }
      return { id, status };
    },
  };
}
export type OpinionService = ReturnType<typeof createOpinionService>;
