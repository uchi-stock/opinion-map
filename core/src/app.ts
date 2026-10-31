import {
  parseEventCreate,
  parseEventPatch,
  parseEditKeyBody,
  parsePresence,
  parseReaction,
  parseProposalCreate,
  parseProposalDecision,
  parseNotes,
  parseClientError,
  parseModeration,
  parseOpinionCreate,
  parseOpinionEdit,
  parseSessionCreate,
  parseSessionPatch,
} from "./domain/validation.js";
import { createAuthenticator, type Principal } from "./lib/auth.js";
import { createGoogleVerifier } from "./lib/googleAuth.js";
import { signSession } from "./lib/jwt.js";
import { AppError, badRequest, forbidden, notFound, unauthorized } from "./lib/errors.js";
import type { Repositories } from "./repositories/types.js";
import type { AnalysisProvider } from "./analysis/types.js";
import { createAnalysisService } from "./services/analysisService.js";
import { createEventService } from "./services/eventService.js";
import type { InsightProvider } from "./insights/types.js";
import { createInsightService } from "./services/insightService.js";
import { consoleLogger, type Logger } from "./lib/log.js";
import { createUsageService, DEFAULT_DAILY_LIMITS, type DailyLimits } from "./services/usageService.js";
import { createSummaryService } from "./services/summaryService.js";
import { createProposalService } from "./services/proposalService.js";
import { createAdminService } from "./services/adminService.js";
import { createOpinionService, type OpinionRateLimit } from "./services/opinionService.js";
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
  /** 分析基盤。未指定なら、分析のAPIは使えない（503） */
  analysisProvider?: AnalysisProvider;
  analysisTimeoutMs?: number;
  /** 共通点・相違点・問いの案を作るLLM。未指定なら、そのAPIは使えない（503） */
  insightProvider?: InsightProvider;
  opinionMaxLength?: number;
  /**
   * Googleアカウントでのオーナーのログイン。未指定なら、POST /auth/session は使えない(503)。
   * ownerEmails に載っているメールアドレスだけが、オーナーになれる。
   */
  ownerLogin?: OwnerLoginOptions;
  /** テーマごとの投稿頻度の上限。未指定なら、1分に120件 */
  opinionRateLimit?: OpinionRateLimit;
  /** 運用監視のログの出力先。未指定なら、標準出力にJSONで出す */
  log?: Logger;
  /** AIの利用の、1日あたりの上限(イベントごと)。未指定なら、既定の上限 */
  dailyLimits?: Partial<DailyLimits>;
  now?: () => Date;
  newId?: () => string;
}

export interface OwnerLoginOptions {
  googleClientId: string;
  /** セッショントークンの署名鍵。32文字以上 */
  sessionSecret: string;
  ownerEmails: readonly string[];
  /** セッションの有効期間(秒)。既定は7日 */
  sessionSeconds?: number;
  fetch?: typeof fetch;
}

export const DEFAULT_SESSION_SECONDS = 7 * 24 * 60 * 60;
export const MIN_SESSION_SECRET_LENGTH = 32;

/** リクエスト本文の上限（バイト）。投稿は短い文章なので、小さく抑える */
export const MAX_BODY_BYTES = 16 * 1024;

type Params = Record<string, string>;
interface Route {
  method: string;
  pattern: RegExp;
  admin: boolean;
  handle: (ctx: {
    params: Params;
    body: unknown;
    isAdmin: boolean;
    principal: Principal | null;
    headers: Record<string, string | undefined>;
  }) => Promise<{ status: number; data: unknown }>;
}

export function createApp(options: AppOptions) {
  const ctx = {
    repos: options.repos,
    now: options.now ?? (() => new Date()),
    newId: options.newId ?? (() => globalThis.crypto.randomUUID()),
    log: options.log ?? consoleLogger,
  };
  const events = createEventService(ctx);
  const sessions = createSessionService(ctx);
  const opinions = createOpinionService(ctx, options.opinionRateLimit);
  const proposals = createProposalService(ctx);
  const summaries = createSummaryService(ctx);
  const usage = createUsageService(ctx, { ...DEFAULT_DAILY_LIMITS, ...options.dailyLimits });
  const login = options.ownerLogin;
  const admins = createAdminService(ctx, login?.ownerEmails ?? []);
  if (login && login.sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(`sessionSecret は${MIN_SESSION_SECRET_LENGTH}文字以上にしてください`);
  }
  const verifyGoogle = login
    ? createGoogleVerifier({ clientId: login.googleClientId, ...(login.fetch ? { fetch: login.fetch } : {}), now: ctx.now })
    : undefined;
  const authenticate = createAuthenticator(options.adminToken, {
    ...(login ? { session: { secret: login.sessionSecret, isOwnerEmail: admins.isAdmin, now: ctx.now } } : {}),
  });
  const analyses = options.analysisProvider
    ? createAnalysisService(ctx, options.analysisProvider, {
        ...(options.analysisTimeoutMs === undefined ? {} : { timeoutMs: options.analysisTimeoutMs }),
        usage,
      })
    : undefined;
  const insights = options.insightProvider ? createInsightService(ctx, options.insightProvider, usage) : undefined;
  const requireInsights = () => {
    if (!insights) throw new AppError(503, "insights_unavailable", "案を作るAIが設定されていません");
    return insights;
  };
  const requireAnalyses = () => {
    if (!analyses) throw new AppError(503, "analysis_unavailable", "分析基盤が設定されていません");
    return analyses;
  };

  const routes: Route[] = [
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
      method: "PATCH",
      pattern: /^\/opinions\/(?<id>[^/]+)$/,
      admin: false,
      handle: async ({ params, body }) => ({
        status: 200,
        data: { opinion: await opinions.edit(params["id"]!, parseOpinionEdit(body, options.opinionMaxLength)) },
      }),
    },
    {
      // 招待なしで、トップページに出す、公開中のイベントの一覧
      method: "GET",
      pattern: /^\/public\/events$/,
      admin: false,
      handle: async () => ({ status: 200, data: { events: await opinions.listPublicEvents() } }),
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
    // 投稿本文などを含みうるため、詳細(メッセージ)はログに出さない。種類の名前だけを残す
    ctx.log("server_error", { name: error instanceof Error ? error.name : "unknown" });
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
      const principal = await authenticate(request.headers);
      const isAdmin = principal !== null;

      let pathMatched = false;
      for (const route of routes) {
        const match = route.pattern.exec(path);
        if (!match) continue;
        pathMatched = true;
        if (route.method !== method) continue;
        if (route.admin && !principal) throw unauthorized();
        const params: Params = { ...(match.groups ?? {}) };
        const result = await route.handle({ params, body: parseBody(request.body), isAdmin, principal, headers: request.headers });
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
