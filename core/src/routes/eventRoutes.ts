import type { Route, RouteDeps } from "./types.js";
import { parseEventCreate, parseEventPatch, parseNotes, parseClientError, parseSessionCreate, parseSessionPatch } from "../domain/validation.js";

/** eventRoutes: このグループのAPIの定義 */
export function eventRoutes(d: RouteDeps): Route[] {
  const { ctx, events, sessions, opinions, summaries, usage, admins } = d;
  return [
    {
      method: "POST",
      pattern: /^\/events$/,
      admin: true,
      handle: async ({ body, principal }) => ({
        status: 201,
        data: await events.create(parseEventCreate(body), principal?.kind === "owner" && principal.email ? principal.email : "(token)"),
      }),
    },
    {
      method: "GET",
      pattern: /^\/events$/,
      admin: true,
      handle: async () => {
        const all = await events.list();
        // 作った管理者のプロフィール画像を、一覧に添える
        const pictures = new Map((await admins.list()).map((a) => [a.email, a.picture]));
        const withCreator = all.map((e) => {
          const picture = e.createdBy ? pictures.get(e.createdBy) : undefined;
          return picture ? { ...e, creatorPicture: picture } : e;
        });
        return { status: 200, data: { events: withCreator } };
      },
    },
    {
      method: "PATCH",
      pattern: /^\/events\/(?<id>[^/]+)$/,
      admin: true,
      handle: async ({ params, body }) => ({
        status: 200,
        data: await events.update(params["id"]!, parseEventPatch(body)),
      }),
    },
    {
      method: "POST",
      pattern: /^\/events\/(?<id>[^/]+)\/sessions$/,
      admin: true,
      handle: async ({ params, body }) => ({
        status: 201,
        data: await sessions.create(params["id"]!, parseSessionCreate(body)),
      }),
    },
    {
      method: "GET",
      pattern: /^\/events\/(?<id>[^/]+)\/sessions$/,
      admin: true,
      handle: async ({ params }) => ({ status: 200, data: { sessions: await sessions.listByEvent(params["id"]!) } }),
    },
    {
      method: "PATCH",
      pattern: /^\/sessions\/(?<id>[^/]+)$/,
      admin: true,
      handle: async ({ params, body }) => ({
        status: 200,
        data: await sessions.update(params["id"]!, parseSessionPatch(body)),
      }),
    },
    {
      // 画面の描画エラーの報告。ログに残すだけで、何も保存しない。量は1日の上限で抑える
      method: "POST",
      pattern: /^\/client-errors$/,
      admin: false,
      handle: async ({ body }) => {
        const report = parseClientError(body);
        await usage.consume("clientError", "global");
        ctx.log("client_error", { message: report.message, path: report.path });
        return { status: 202, data: { received: true } };
      },
    },
    {
      method: "GET",
      pattern: /^\/events\/(?<id>[^/]+)\/usage$/,
      admin: true,
      handle: async ({ params }) => ({ status: 200, data: await usage.summary(params["id"]!) }),
    },
    {
      method: "GET",
      pattern: /^\/sessions\/(?<id>[^/]+)\/summary$/,
      admin: false,
      handle: async ({ params }) => ({ status: 200, data: await summaries.getPublished(params["id"]!) }),
    },
    {
      method: "PUT",
      pattern: /^\/sessions\/(?<id>[^/]+)\/notes$/,
      admin: true,
      handle: async ({ params, body }) => {
        const session = await sessions.saveNotes(params["id"]!, parseNotes(body));
        return { status: 200, data: { notes: session.notes, published: session.notesPublished === true } };
      },
    },
    {
      method: "GET",
      pattern: /^\/events\/(?<id>[^/]+)\/notes$/,
      admin: false,
      handle: async ({ params, principal }) => {
        // 運営者は、担当のイベントの記録を、未公開を含めてすべて見られる
        const isAdmin = principal?.kind === "owner";
        return { status: 200, data: { notes: await sessions.listNotes(params["id"]!, isAdmin) } };
      },
    },
    {
      method: "GET",
      pattern: /^\/events\/(?<id>[^/]+)\/public$/,
      admin: false,
      handle: async ({ params }) => ({ status: 200, data: await opinions.getPublicEvent(params["id"]!) }),
    },
    {
      method: "GET",
      pattern: /^\/sessions\/(?<id>[^/]+)$/,
      admin: false,
      handle: async ({ params }) => ({ status: 200, data: await opinions.getPublicSession(params["id"]!) }),
    },
    {
      // 招待なしで、トップページに出す、公開中のイベントの一覧
      method: "GET",
      pattern: /^\/public\/events$/,
      admin: false,
      handle: async () => ({ status: 200, data: { events: await opinions.listPublicEvents() } }),
    },
  ];
}
