import type { Route, RouteDeps } from "./types.js";

/** analysisRoutes: このグループのAPIの定義 */
export function analysisRoutes(d: RouteDeps): Route[] {
  const { requireAnalyses, requireInsights } = d;
  return [
    {
      method: "POST",
      pattern: /^\/sessions\/(?<id>[^/]+)\/analyses$/,
      admin: true,
      handle: async ({ params }) => ({ status: 202, data: await requireAnalyses().start(params["id"]!) }),
    },
    {
      method: "GET",
      pattern: /^\/sessions\/(?<id>[^/]+)\/analyses$/,
      admin: true,
      handle: async ({ params }) => ({
        status: 200,
        data: { analyses: await requireAnalyses().list(params["id"]!) },
      }),
    },
    {
      method: "GET",
      pattern: /^\/analyses\/(?<id>[^/]+)$/,
      admin: true,
      handle: async ({ params }) => ({ status: 200, data: await requireAnalyses().get(params["id"]!) }),
    },
    {
      method: "POST",
      pattern: /^\/analyses\/(?<id>[^/]+)\/clusters\/(?<clusterId>[^/]+)\/insights$/,
      admin: true,
      handle: async ({ params }) => ({
        status: 201,
        data: await requireInsights().generate(params["id"]!, decodeURIComponent(params["clusterId"]!)),
      }),
    },
    {
      method: "GET",
      pattern: /^\/analyses\/(?<id>[^/]+)\/insights$/,
      admin: true,
      handle: async ({ params }) => ({
        status: 200,
        data: { insights: await requireInsights().list(params["id"]!) },
      }),
    },
    {
      method: "PATCH",
      pattern: /^\/insights\/(?<id>[^/]+)$/,
      admin: true,
      handle: async ({ params, body }) => ({
        status: 200,
        data: await requireInsights().update(params["id"]!, (body ?? {}) as { edited?: unknown; approved?: unknown }),
      }),
    },
    {
      method: "POST",
      pattern: /^\/analyses\/(?<id>[^/]+)\/retry$/,
      admin: true,
      handle: async ({ params }) => ({ status: 202, data: await requireAnalyses().retry(params["id"]!) }),
    },
  ];
}
