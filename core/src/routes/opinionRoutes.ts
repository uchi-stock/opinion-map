import type { Route, RouteDeps } from "./types.js";
import { parseEditKeyBody, parsePresence, parseReaction, parseModeration, parseOpinionCreate, parseOpinionEdit } from "../domain/validation.js";

/** opinionRoutes: このグループのAPIの定義 */
export function opinionRoutes(d: RouteDeps): Route[] {
  const { opinions, opinionMaxLength } = d;
  return [
    {
      method: "POST",
      pattern: /^\/sessions\/(?<id>[^/]+)\/opinions$/,
      admin: false,
      handle: async ({ params, body }) => {
        const input = parseOpinionCreate(body, opinionMaxLength);
        const result = await opinions.submit(params["id"]!, input);
        return { status: result.created ? 201 : 200, data: { opinion: result.opinion, duplicate: !result.created } };
      },
    },
    {
      method: "PATCH",
      pattern: /^\/opinions\/(?<id>[^/]+)$/,
      admin: false,
      handle: async ({ params, body }) => ({
        status: 200,
        data: { opinion: await opinions.edit(params["id"]!, parseOpinionEdit(body, opinionMaxLength)) },
      }),
    },
    {
      method: "POST",
      pattern: /^\/sessions\/(?<id>[^/]+)\/presence$/,
      admin: false,
      handle: async ({ params, body }) => {
        await opinions.touchPresence(params["id"]!, parsePresence(body).deviceId);
        return { status: 200, data: { ok: true } };
      },
    },
    {
      method: "POST",
      pattern: /^\/opinions\/(?<id>[^/]+)\/reaction$/,
      admin: false,
      handle: async ({ params, body }) => {
        const { voterId, reacted } = parseReaction(body);
        return { status: 200, data: await opinions.react(params["id"]!, voterId, reacted) };
      },
    },
    {
      method: "POST",
      pattern: /^\/opinions\/(?<id>[^/]+)\/delete$/,
      admin: false,
      handle: async ({ params, body }) => {
        await opinions.deleteByAuthor(params["id"]!, parseEditKeyBody(body));
        return { status: 200, data: { deleted: true } };
      },
    },
    {
      method: "POST",
      pattern: /^\/opinions\/(?<id>[^/]+)\/moderation$/,
      admin: true,
      handle: async ({ params, body }) => ({
        status: 200,
        data: await opinions.moderate(params["id"]!, parseModeration(body)),
      }),
    },
    {
      method: "GET",
      pattern: /^\/sessions\/(?<id>[^/]+)\/opinions$/,
      admin: false,
      handle: async ({ params, principal }) => {
        // 管理者は、すべての投稿を見られる
        const isAdmin = principal?.kind === "owner";
        if (isAdmin) {
          return { status: 200, data: { hidden: false, opinions: await opinions.listForAdmin(params["id"]!) } };
        }
        return { status: 200, data: await opinions.listForParticipant(params["id"]!) };
      },
    },
  ];
}
