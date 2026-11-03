import { createAuthenticator } from "./lib/auth.js";
import { createGoogleVerifier } from "./lib/googleAuth.js";
import { AppError, badRequest, notFound, unauthorized } from "./lib/errors.js";
import type { Repositories } from "./repositories/types.js";
import type { AnalysisProvider } from "./analysis/types.js";
import { createAnalysisService } from "./services/analysisService.js";
import { createEventService } from "./services/eventService.js";
import type { InsightProvider } from "./insights/types.js";
import { createInsightService } from "./services/insightService.js";
import { trimTrailingSlashes } from "./lib/path.js";
import { consoleLogger, type Logger } from "./lib/log.js";
import { createUsageService, DEFAULT_DAILY_LIMITS, type DailyLimits } from "./services/usageService.js";
import { createSummaryService } from "./services/summaryService.js";
import { createProposalService } from "./services/proposalService.js";
import { createAdminService } from "./services/adminService.js";
import { createOpinionService, type OpinionRateLimit } from "./services/opinionService.js";
import { createTimerService } from "./services/timerService.js";
import { createSessionService } from "./services/sessionService.js";
import { DEFAULT_SESSION_SECONDS, MIN_SESSION_SECRET_LENGTH } from "./routes/constants.js";
import { analysisRoutes } from "./routes/analysisRoutes.js";
import { authRoutes } from "./routes/authRoutes.js";
import { eventRoutes } from "./routes/eventRoutes.js";
import { opinionRoutes } from "./routes/opinionRoutes.js";
import { proposalRoutes } from "./routes/proposalRoutes.js";
import type { OwnerLoginOptions, Params, Route, RouteDeps } from "./routes/types.js";

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

export type { OwnerLoginOptions };

export { DEFAULT_SESSION_SECONDS, MIN_SESSION_SECRET_LENGTH };

/** リクエスト本文の上限（バイト）。投稿は短い文章なので、小さく抑える */
export const MAX_BODY_BYTES = 16 * 1024;

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

  const deps: RouteDeps = {
    ctx,
    events,
    sessions,
    opinions,
    proposals,
    summaries,
    usage,
    admins,
    login,
    verifyGoogle,
    requireAnalyses,
    requireInsights,
    opinionMaxLength: options.opinionMaxLength,
  };
  const routes: Route[] = [
    ...authRoutes(deps),
    ...eventRoutes(deps),
    ...proposalRoutes(deps),
    ...analysisRoutes(deps),
    ...opinionRoutes(deps),
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
      const path = request.path.length > 1 ? trimTrailingSlashes(request.path) : request.path;
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

  const timer = createTimerService(ctx, analyses);
  /** 制限時間が過ぎたテーマを締め切り、分析を始める(定期実行から呼ぶ)。締め切ったテーマの数を返す */
  const sweepTimers = () => timer.sweep();

  return { handleRequest, sweepTimers };
}
export type App = ReturnType<typeof createApp>;
