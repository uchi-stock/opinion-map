import type { Principal } from "../lib/auth.js";
import type { AnalysisService } from "../services/analysisService.js";
import type { TranscriptService } from "../services/transcriptService.js";
import type { createInsightService } from "../services/insightService.js";
import type { ServiceContext } from "../services/context.js";
import type { EventService } from "../services/eventService.js";
import type { SessionService } from "../services/sessionService.js";
import type { OpinionService } from "../services/opinionService.js";
import type { ProposalService } from "../services/proposalService.js";
import type { createSummaryService } from "../services/summaryService.js";
import type { UsageService } from "../services/usageService.js";
import type { createAdminService } from "../services/adminService.js";
import type { createGoogleVerifier } from "../lib/googleAuth.js";

export type Params = Record<string, string>;

/** 1つのAPIの定義。admin が true なら、管理者だけが使える */
export interface Route {
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


/** ルートの定義が使う、サービスと設定。createApp が組み立てて渡す */
export interface RouteDeps {
  ctx: ServiceContext;
  events: EventService;
  sessions: SessionService;
  opinions: OpinionService;
  proposals: ProposalService;
  summaries: ReturnType<typeof createSummaryService>;
  usage: UsageService;
  admins: ReturnType<typeof createAdminService>;
  login: OwnerLoginOptions | undefined;
  verifyGoogle: ReturnType<typeof createGoogleVerifier> | undefined;
  requireAnalyses: () => AnalysisService;
  requireInsights: () => ReturnType<typeof createInsightService>;
  requireTranscripts: () => TranscriptService;
  opinionMaxLength: number | undefined;
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
