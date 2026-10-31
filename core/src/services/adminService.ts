import { badRequest, notFound } from "../lib/errors.js";
import type { AdminRecord } from "../domain/types.js";
import type { ServiceContext } from "./context.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;
export const SEED_ADDED_BY = "(seed)";

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * 管理者の一覧。アプリ側(DynamoDB)で持つ。
 * 環境変数 OWNER_EMAILS は、一覧が空のときの初期登録(seed)にだけ使う。
 * 一度でも登録されたあとは、環境変数を変えても一覧は変わらない。
 */
export function createAdminService(ctx: ServiceContext, seedEmails: readonly string[]) {
  const seeds = seedEmails.map(normalizeEmail).filter((e) => e !== "");

  async function seedIfEmpty(): Promise<void> {
    if (seeds.length === 0) return;
    if ((await ctx.repos.admins.list()).length > 0) return;
    const addedAt = ctx.now().toISOString();
    for (const email of seeds) await ctx.repos.admins.createIfAbsent({ email, addedAt, addedBy: SEED_ADDED_BY });
  }

  return {
    /** リクエストごとに呼ぶ。一覧から外された人を、すぐに拒否するため */
    async isAdmin(rawEmail: string): Promise<boolean> {
      const email = normalizeEmail(rawEmail);
      if (await ctx.repos.admins.get(email)) return true;
      if (!seeds.includes(email)) return false;
      await seedIfEmpty();
      return (await ctx.repos.admins.get(email)) !== undefined;
    },

    async list(): Promise<AdminRecord[]> {
      await seedIfEmpty();
      return ctx.repos.admins.list();
    },

    async add(rawEmail: unknown, addedBy: string): Promise<AdminRecord> {
      if (typeof rawEmail !== "string") throw badRequest("invalid_email", "メールアドレスを入力してください");
      const email = normalizeEmail(rawEmail);
      if (email.length > MAX_EMAIL || !EMAIL_PATTERN.test(email)) {
        throw badRequest("invalid_email", "メールアドレスの形式が正しくありません");
      }
      await seedIfEmpty();
      const existing = await ctx.repos.admins.get(email);
      if (existing) return existing;
      const record: AdminRecord = { email, addedAt: ctx.now().toISOString(), addedBy };
      await ctx.repos.admins.createIfAbsent(record);
      return (await ctx.repos.admins.get(email)) ?? record;
    },

    /** 最後の1人は消せない。管理者がいなくなり、誰も入れなくなるのを防ぐ */
    async remove(rawEmail: string): Promise<void> {
      const email = normalizeEmail(rawEmail);
      await seedIfEmpty();
      if (!(await ctx.repos.admins.get(email))) throw notFound("管理者");
      if ((await ctx.repos.admins.list()).length <= 1) {
        throw badRequest("last_admin", "最後の管理者は削除できません");
      }
      await ctx.repos.admins.remove(email);
    },
  };
}
