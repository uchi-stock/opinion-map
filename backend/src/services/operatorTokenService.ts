import { OPERATOR_TOKEN_PREFIX } from "../lib/auth.js";
import { badRequest, notFound } from "../lib/errors.js";
import { sha256Hex } from "../lib/hash.js";
import type { OperatorTokenRecord } from "../domain/types.js";
import type { ServiceContext } from "./context.js";

export interface PublicOperatorToken {
  id: string;
  eventId: string;
  label: string;
  createdAt: string;
  revokedAt?: string;
}

const MAX_LABEL = 50;

function toPublic(t: OperatorTokenRecord): PublicOperatorToken {
  const out: PublicOperatorToken = { id: t.id, eventId: t.eventId, label: t.label, createdAt: t.createdAt };
  if (t.revokedAt) out.revokedAt = t.revokedAt;
  return out;
}

/** 256ビットの乱数を、URLに使える文字にする */
function randomToken(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const base64 = btoa(String.fromCharCode(...bytes));
  return OPERATOR_TOKEN_PREFIX + base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createOperatorTokenService(ctx: ServiceContext) {
  return {
    /** トークンの本体を返すのは、この発行のときだけ。あとからは、確認も再表示もできない */
    async issue(eventId: string, rawLabel: unknown): Promise<PublicOperatorToken & { token: string }> {
      if (typeof rawLabel !== "string" || rawLabel.trim() === "" || [...rawLabel.trim()].length > MAX_LABEL) {
        throw badRequest("invalid_label", `名前は1〜${MAX_LABEL}文字で入力してください`);
      }
      if (!(await ctx.repos.events.get(eventId))) throw notFound("イベント");
      const token = randomToken();
      const record: OperatorTokenRecord = {
        id: ctx.newId(),
        eventId,
        label: rawLabel.trim(),
        tokenHash: await sha256Hex(token),
        createdAt: ctx.now().toISOString(),
      };
      await ctx.repos.operatorTokens.create(record);
      return { ...toPublic(record), token };
    },

    async list(eventId: string): Promise<PublicOperatorToken[]> {
      return (await ctx.repos.operatorTokens.listByEvent(eventId)).map(toPublic);
    },

    /** 失効は取り消せない。再び使わせたいときは、新しく発行する */
    async revoke(id: string): Promise<PublicOperatorToken> {
      const record = await ctx.repos.operatorTokens.get(id);
      if (!record) throw notFound("トークン");
      if (record.revokedAt) return toPublic(record);
      const next = { ...record, revokedAt: ctx.now().toISOString() };
      await ctx.repos.operatorTokens.update(next);
      return toPublic(next);
    },

    async eventIdOf(id: string): Promise<string | undefined> {
      return (await ctx.repos.operatorTokens.get(id))?.eventId;
    },
  };
}
