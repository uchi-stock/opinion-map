import type { Route, RouteDeps } from "./types.js";
import { AppError, forbidden, unauthorized } from "../lib/errors.js";
import { signSession } from "../lib/jwt.js";
import { DEFAULT_SESSION_SECONDS } from "./constants.js";

/** authRoutes: このグループのAPIの定義 */
export function authRoutes(d: RouteDeps): Route[] {
  const { ctx, admins, login, verifyGoogle } = d;
  return [
    {
      method: "GET",
      pattern: /^\/health$/,
      admin: false,
      handle: async () => ({ status: 200, data: { status: "ok" } }),
    },
    {
      // Googleのトークンを、オーナーのセッショントークンに交換する。ログイン時の1回だけ使う
      method: "POST",
      pattern: /^\/auth\/session$/,
      admin: false,
      handle: async ({ headers }) => {
        if (!login || !verifyGoogle) throw new AppError(503, "login_unavailable", "Googleログインが設定されていません");
        const header = headers["authorization"];
        if (!header || !header.startsWith("Bearer ")) throw unauthorized();
        const identity = await verifyGoogle(header.slice("Bearer ".length));
        if (!(await admins.isAdmin(identity.email))) {
          throw forbidden("not_owner", "このアカウントは、運営者として登録されていません");
        }
        await admins.recordProfile(identity.email, identity.picture);
        const iat = Math.floor(ctx.now().getTime() / 1000);
        const exp = iat + (login.sessionSeconds ?? DEFAULT_SESSION_SECONDS);
        const token = await signSession({ sub: identity.sub, email: identity.email, iat, exp }, login.sessionSecret);
        return { status: 200, data: { token, email: identity.email, expiresAt: new Date(exp * 1000).toISOString() } };
      },
    },
    {
      method: "GET",
      pattern: /^\/me$/,
      admin: true,
      handle: async ({ principal }) => {
        // ログイン中のアカウントのアイコン(Googleのプロフィール画像)。無ければ、画面が頭文字で代わりにする
        const picture = principal?.email ? (await ctx.repos.admins.get(principal.email.toLowerCase()))?.picture : undefined;
        return {
          status: 200,
          data: { role: "owner", ...(principal?.email ? { email: principal.email } : {}), ...(picture ? { picture } : {}) },
        };
      },
    },
    {
      method: "GET",
      pattern: /^\/admins$/,
      admin: true,
      handle: async () => ({ status: 200, data: { admins: await admins.list() } }),
    },
    {
      method: "POST",
      pattern: /^\/admins$/,
      admin: true,
      handle: async ({ body, principal }) => ({
        status: 201,
        data: await admins.add(
          (body as { email?: unknown } | undefined)?.email,
          principal?.kind === "owner" && principal.email ? principal.email : "(token)",
        ),
      }),
    },
    {
      method: "DELETE",
      pattern: /^\/admins\/(?<email>[^/]+)$/,
      admin: true,
      handle: async ({ params }) => {
        await admins.remove(decodeURIComponent(params["email"]!));
        return { status: 200, data: { removed: true } };
      },
    },
  ];
}
