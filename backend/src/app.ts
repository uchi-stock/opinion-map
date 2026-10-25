import {
  parseEventCreate,
  parseEventPatch,
  parseOpinionCreate,
  parseSessionCreate,
  parseSessionPatch,
} from "./domain/validation.js";
import { createAdminAuthenticator } from "./lib/auth.js";
import { AppError, badRequest, notFound, unauthorized } from "./lib/errors.js";
import type { Repositories } from "./repositories/types.js";
import { createEventService } from "./services/eventService.js";
import { createOpinionService } from "./services/opinionService.js";
import { createSessionService } from "./services/sessionService.js";

export interface HttpRequest {
  method: string;
  path: string;
  /** キーは小文字にそろえる */
  headers: Record<string, string | undefined>;
  body?: string;
}

export interface HttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface AppOptions {
  repos: Repositories;
  adminToken: string | undefined;
  /** CORS で許可するオリジン。未指定なら、ヘッダーを付けない */
  allowedOrigin?: string;
  opinionMaxLength?: number;
  now?: () => Date;
  newId?: () => string;
}

/** リクエスト本文の上限（バイト）。投稿は短い文章なので、小さく抑える */
export const MAX_BODY_BYTES = 16 * 1024;

type Params = Record<string, string>;
interface Route {
  method: string;
  pattern: RegExp;
  admin: boolean;
  handle: (ctx: { params: Params; body: unknown; isAdmin: boolean }) => Promise<{ status: number; data: unknown }>;
}

export function createApp(options: AppOptions) {
  const ctx = {
    repos: options.repos,
    now: options.now ?? (() => new Date()),
    newId: options.newId ?? (() => globalThis.crypto.randomUUID()),
  };
  const events = createEventService(ctx);
  const sessions = createSessionService(ctx);
  const opinions = createOpinionService(ctx);
  const isAdminRequest = createAdminAuthenticator(options.adminToken);

  const routes: Route[] = [
    {
      method: "GET",
      pattern: /^\/health$/,
      admin: false,
      handle: async () => ({ status: 200, data: { status: "ok" } }),
    },
    {
      method: "POST",
      pattern: /^\/events$/,
      admin: true,
      handle: async ({ body }) => ({ status: 201, data: await events.create(parseEventCreate(body)) }),
    },
    {
      method: "GET",
      pattern: /^\/events$/,
      admin: true,
      handle: async () => ({ status: 200, data: { events: await events.list() } }),
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
      method: "GET",
      pattern: /^\/sessions\/(?<id>[^/]+)$/,
      admin: false,
      handle: async ({ params }) => ({ status: 200, data: await opinions.getPublicSession(params["id"]!) }),
    },
    {
      method: "POST",
      pattern: /^\/sessions\/(?<id>[^/]+)\/opinions$/,
      admin: false,
      handle: async ({ params, body }) => {
        const input = parseOpinionCreate(body, options.opinionMaxLength);
        const result = await opinions.submit(params["id"]!, input);
        return { status: result.created ? 201 : 200, data: { opinion: result.opinion, duplicate: !result.created } };
      },
    },
    {
      method: "GET",
      pattern: /^\/sessions\/(?<id>[^/]+)\/opinions$/,
      admin: false,
      handle: async ({ params, isAdmin }) => {
        if (isAdmin) {
          return { status: 200, data: { hidden: false, opinions: await opinions.listForAdmin(params["id"]!) } };
        }
        return { status: 200, data: await opinions.listForParticipant(params["id"]!) };
      },
    },
  ];

  function baseHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    };
    if (options.allowedOrigin) {
      headers["access-control-allow-origin"] = options.allowedOrigin;
      headers["access-control-allow-headers"] = "authorization, content-type";
      headers["access-control-allow-methods"] = "GET, POST, PATCH, OPTIONS";
      headers["vary"] = "Origin";
    }
    return headers;
  }

  function respond(statusCode: number, data: unknown): HttpResponse {
    return { statusCode, headers: baseHeaders(), body: JSON.stringify(data) };
  }

  function respondError(error: unknown): HttpResponse {
    if (error instanceof AppError) {
      return respond(error.status, { error: { code: error.code, message: error.message } });
    }
    // 投稿本文などを含みうるため、詳細はログに出さない
    return respond(500, { error: { code: "internal_error", message: "サーバーでエラーが発生しました" } });
  }

  function parseBody(raw: string | undefined): unknown {
    if (raw === undefined || raw === "") return undefined;
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      throw new AppError(413, "payload_too_large", "リクエストが大きすぎます");
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw badRequest("invalid_json", "リクエストの本文がJSONとして読めません");
    }
  }

  async function handleRequest(request: HttpRequest): Promise<HttpResponse> {
    try {
      const method = request.method.toUpperCase();
      if (method === "OPTIONS") {
        return { statusCode: 204, headers: baseHeaders(), body: "" };
      }
      const path = request.path.length > 1 ? request.path.replace(/\/+$/, "") : request.path;
      const isAdmin = isAdminRequest(request.headers);

      let pathMatched = false;
      for (const route of routes) {
        const match = route.pattern.exec(path);
        if (!match) continue;
        pathMatched = true;
        if (route.method !== method) continue;
        if (route.admin && !isAdmin) throw unauthorized();
        const params: Params = { ...(match.groups ?? {}) };
        const result = await route.handle({ params, body: parseBody(request.body), isAdmin });
        return respond(result.status, result.data);
      }
      if (pathMatched) throw new AppError(405, "method_not_allowed", "このメソッドは使えません");
      throw notFound("ページ");
    } catch (error) {
      return respondError(error);
    }
  }

  return { handleRequest };
}
export type App = ReturnType<typeof createApp>;
