import { badRequest } from "../lib/errors.js";
import { DESCRIPTION_MAX_LENGTH, NAME_MAX_LENGTH, PROMPT_MAX_LENGTH, CONTROL_CHARS_ALL, SUBMISSION_ID, asObject, oneOf, text } from "./validationHelpers.js";
import {
  EVENT_STATUSES,
  SESSION_FORMATS,
  SESSION_STATUSES,
  type EventStatus,
  type SessionFormat,
  type SessionStatus,
} from "./types.js";

export interface EventInput {
  name: string;
  description: string;
}
export function parseEventCreate(body: unknown): EventInput {
  const obj = asObject(body);
  return {
    name: text(obj, "name", "イベント名", NAME_MAX_LENGTH, { required: true })!,
    description: text(obj, "description", "説明", DESCRIPTION_MAX_LENGTH, { required: false }) ?? "",
  };
}

/** 同時に開けるテーマの数の上限。画面が煩雑にならない範囲 */
export const MAX_OPEN_SESSIONS = 20;

export interface EventPatch {
  name?: string;
  description?: string;
  status?: EventStatus;
  /** いまのテーマ。null で解除する(従来の動きに戻る) */
  currentSessionId?: string | null;
  /** 開いているテーマ。null で解除する(公開中のテーマすべてが開く) */
  openSessionIds?: string[] | null;
  acceptingProposals?: boolean;
  showPendingProposals?: boolean;
}
/** いまのテーマの指定。null は解除 */
function parseCurrentSessionId(value: unknown): string | null {
  if (value !== null && (typeof value !== "string" || value.trim() === "" || value.length > 128)) {
    throw badRequest("invalid_current_session", "いまのテーマの指定が正しくありません");
  }
  return value as string | null;
}

/** 真偽値の指定 */
function parseFlag(value: unknown, key: string): boolean {
  if (typeof value !== "boolean") throw badRequest("invalid_type", `${key} は真偽値で指定してください`);
  return value;
}

/** 開くテーマの指定。null は解除(公開中のテーマすべてが開く) */
function parseOpenSessionIds(value: unknown): string[] | null {
  const valid =
    value === null ||
    (Array.isArray(value) && value.length <= MAX_OPEN_SESSIONS && value.every((v) => typeof v === "string" && v.trim() !== "" && v.length <= 128));
  if (!valid) throw badRequest("invalid_open_sessions", "開くテーマの指定が正しくありません");
  return value === null ? null : [...new Set(value as string[])];
}

export function parseEventPatch(body: unknown): EventPatch {
  const obj = asObject(body);
  const patch: EventPatch = {};
  const name = text(obj, "name", "イベント名", NAME_MAX_LENGTH, { required: false });
  if (name !== undefined) {
    if (name.length === 0) throw badRequest("required", "イベント名を入力してください");
    patch.name = name;
  }
  const description = text(obj, "description", "説明", DESCRIPTION_MAX_LENGTH, { required: false });
  if (description !== undefined) patch.description = description;
  const status = oneOf(obj, "status", "イベントの状態", EVENT_STATUSES, { required: false });
  if (status !== undefined) patch.status = status;
  if ("currentSessionId" in obj) patch.currentSessionId = parseCurrentSessionId(obj["currentSessionId"]);
  for (const key of ["acceptingProposals", "showPendingProposals"] as const) {
    if (key in obj) patch[key] = parseFlag(obj[key], key);
  }
  if ("openSessionIds" in obj) patch.openSessionIds = parseOpenSessionIds(obj["openSessionIds"]);
  return patch;
}

/** 画面のエラーの報告。メッセージは短く切り、制御文字を除く。アドレスは、パスだけにして、クエリとハッシュを落とす */
export function parseClientError(body: unknown): { message: string; path: string } {
  const obj = asObject(body);
  const clean = (value: unknown, max: number) =>
    typeof value === "string" ? Array.from(value.replace(CONTROL_CHARS_ALL, " ")).slice(0, max).join("").trim() : "";
  const message = clean(obj["message"], 200);
  if (message === "") throw badRequest("required", "メッセージを指定してください");
  const rawPath = clean(obj["path"], 200);
  const path = rawPath.split(/[?#]/)[0] ?? "";
  return { message, path: path.startsWith("/") ? path : "" };
}

export const PROPOSAL_TITLE_MAX_LENGTH = 50;

export interface ProposalInput {
  submissionId: string;
  title: string;
  description: string;
}
export function parseProposalCreate(body: unknown): ProposalInput {
  const obj = asObject(body);
  const submissionId = obj["submissionId"];
  if (typeof submissionId !== "string" || !SUBMISSION_ID.test(submissionId)) {
    throw badRequest("invalid_submission_id", "送信IDが正しくありません");
  }
  return {
    submissionId,
    title: text(obj, "title", "議題", PROPOSAL_TITLE_MAX_LENGTH, { required: true })!,
    description: text(obj, "description", "説明", PROMPT_MAX_LENGTH, { required: false }) ?? "",
  };
}

export type ProposalDecision =
  | { status: "approved" }
  | { status: "rejected" }
  | { status: "merged"; intoSessionId: string };
export function parseProposalDecision(body: unknown): ProposalDecision {
  const obj = asObject(body);
  const status = oneOf(obj, "status", "判断", ["approved", "rejected", "merged"] as const, { required: true })!;
  if (status !== "merged") return { status };
  const into = obj["intoSessionId"];
  if (typeof into !== "string" || into.trim() === "" || into.length > 128) {
    throw badRequest("invalid_session", "統合先のテーマを指定してください");
  }
  return { status, intoSessionId: into };
}

export const NOTES_CONCLUSION_MAX = 1000;
export const NOTES_ITEM_MAX = 200;
export const NOTES_OWNER_MAX = 50;
export const NOTES_MAX_ITEMS = 20;

export interface NotesInput {
  conclusion: string;
  nextActions: { text: string; owner: string }[];
  openQuestions: string[];
  published: boolean;
}
export function parseNotes(body: unknown): NotesInput {
  const obj = asObject(body);
  const list = (key: string, label: string): unknown[] => {
    const raw = obj[key];
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw) || raw.length > NOTES_MAX_ITEMS) {
      throw badRequest("invalid_type", `${label}は${NOTES_MAX_ITEMS}件までの一覧で指定してください`);
    }
    return raw;
  };
  const nextActions = list("nextActions", "次の行動").flatMap((item) => {
    const o = asObject(item);
    const t = text(o, "text", "次の行動", NOTES_ITEM_MAX, { required: false }) ?? "";
    const owner = text(o, "owner", "担当", NOTES_OWNER_MAX, { required: false }) ?? "";
    return t === "" ? [] : [{ text: t, owner }];
  });
  const openQuestions = list("openQuestions", "未解決の問い").flatMap((item) => {
    if (typeof item !== "string") throw badRequest("invalid_type", "未解決の問いは文字列で指定してください");
    const q = text({ q: item }, "q", "未解決の問い", NOTES_ITEM_MAX, { required: false }) ?? "";
    return q === "" ? [] : [q];
  });
  const published = obj["published"];
  if (published !== undefined && typeof published !== "boolean") {
    throw badRequest("invalid_type", "published は真偽値で指定してください");
  }
  return {
    conclusion: text(obj, "conclusion", "結論", NOTES_CONCLUSION_MAX, { required: false }) ?? "",
    nextActions,
    openQuestions,
    published: published ?? false,
  };
}

export interface SessionInput {
  title: string;
  prompt: string;
  format: SessionFormat;
  showOpinionsToParticipants: boolean;
  timerSeconds?: number;
}
export function parseSessionCreate(body: unknown): SessionInput {
  const obj = asObject(body);
  const show = obj["showOpinionsToParticipants"];
  if (show !== undefined && typeof show !== "boolean") {
    throw badRequest("invalid_type", "showOpinionsToParticipants は真偽値で指定してください");
  }
  const timerOnCreate = parseTimerSeconds(obj["timerSeconds"]);
  return {
    title: text(obj, "title", "テーマ名", NAME_MAX_LENGTH, { required: true })!,
    prompt: text(obj, "prompt", "問い", PROMPT_MAX_LENGTH, { required: true })!,
    format: oneOf(obj, "format", "形式", SESSION_FORMATS, { required: false }) ?? "workshop",
    showOpinionsToParticipants: show ?? true,
    ...(timerOnCreate === undefined || timerOnCreate === null ? {} : { timerSeconds: timerOnCreate }),
  };
}

export interface SessionPatch {
  title?: string;
  prompt?: string;
  format?: SessionFormat;
  status?: SessionStatus;
  showOpinionsToParticipants?: boolean;
  summaryPublished?: boolean;
  /** 制限時間(秒)。null で解除 */
  timerSeconds?: number | null;
}

export const TIMER_MIN_SECONDS = 60;
export const TIMER_MAX_SECONDS = 24 * 60 * 60;
/** 制限時間の指定。未指定は undefined、null は解除 */
export function parseTimerSeconds(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < TIMER_MIN_SECONDS || value > TIMER_MAX_SECONDS) {
    throw badRequest("invalid_timer", `制限時間は、${TIMER_MIN_SECONDS}秒以上${TIMER_MAX_SECONDS}秒以下の整数で指定してください`);
  }
  return value;
}
export function parseSessionPatch(body: unknown): SessionPatch {
  const obj = asObject(body);
  const patch: SessionPatch = {};
  const title = text(obj, "title", "テーマ名", NAME_MAX_LENGTH, { required: false });
  if (title !== undefined) {
    if (title.length === 0) throw badRequest("required", "テーマ名を入力してください");
    patch.title = title;
  }
  const prompt = text(obj, "prompt", "問い", PROMPT_MAX_LENGTH, { required: false });
  if (prompt !== undefined) {
    if (prompt.length === 0) throw badRequest("required", "問いを入力してください");
    patch.prompt = prompt;
  }
  const format = oneOf(obj, "format", "形式", SESSION_FORMATS, { required: false });
  if (format !== undefined) patch.format = format;
  const status = oneOf(obj, "status", "テーマの状態", SESSION_STATUSES, { required: false });
  if (status !== undefined) patch.status = status;
  const show = obj["showOpinionsToParticipants"];
  if (show !== undefined) {
    if (typeof show !== "boolean") throw badRequest("invalid_type", "showOpinionsToParticipants は真偽値で指定してください");
    patch.showOpinionsToParticipants = show;
  }
  const summaryPublished = obj["summaryPublished"];
  if (summaryPublished !== undefined) {
    if (typeof summaryPublished !== "boolean") throw badRequest("invalid_type", "summaryPublished は真偽値で指定してください");
    patch.summaryPublished = summaryPublished;
  }
  const timer = parseTimerSeconds(obj["timerSeconds"]);
  if (timer !== undefined) patch.timerSeconds = timer;
  return patch;
}

// 共通の部品と、意見まわりの検証は、別のファイルにある。ここから、まとめて取り出せるようにする
export * from "./validationHelpers.js";
export * from "./opinionValidation.js";
