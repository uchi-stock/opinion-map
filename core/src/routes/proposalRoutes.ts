import type { Route, RouteDeps } from "./types.js";
import { parseReaction, parseProposalCreate, parseProposalDecision } from "../domain/validation.js";

/** proposalRoutes: このグループのAPIの定義 */
export function proposalRoutes(d: RouteDeps): Route[] {
  const { proposals } = d;
  return [
    {
      method: "POST",
      pattern: /^\/events\/(?<id>[^/]+)\/proposals$/,
      admin: false,
      handle: async ({ params, body }) => {
        const result = await proposals.submit(params["id"]!, parseProposalCreate(body));
        return { status: result.created ? 201 : 200, data: { proposal: result.proposal, duplicate: !result.created } };
      },
    },
    {
      method: "GET",
      pattern: /^\/events\/(?<id>[^/]+)\/proposals$/,
      admin: false,
      handle: async ({ params, principal }) => {
        // 運営者は、担当のイベントの提案を、すべて見られる
        const isAdmin = principal?.kind === "owner";
        if (isAdmin) return { status: 200, data: { accepting: true, proposals: await proposals.listForAdmin(params["id"]!) } };
        return { status: 200, data: await proposals.listForParticipant(params["id"]!) };
      },
    },
    {
      method: "POST",
      pattern: /^\/proposals\/(?<id>[^/]+)\/reaction$/,
      admin: false,
      handle: async ({ params, body }) => {
        const { voterId, reacted } = parseReaction(body);
        return { status: 200, data: await proposals.react(params["id"]!, voterId, reacted) };
      },
    },
    {
      method: "POST",
      pattern: /^\/proposals\/(?<id>[^/]+)\/decision$/,
      admin: true,
      handle: async ({ params, body }) => ({
        status: 200,
        data: await proposals.decide(params["id"]!, parseProposalDecision(body)),
      }),
    },
  ];
}
