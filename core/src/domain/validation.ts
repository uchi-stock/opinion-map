import { badRequest } from "../lib/errors.js";
import {
  EVENT_STATUSES,
  OPINION_KINDS,
  SESSION_FORMATS,
  SESSION_STATUSES,
  type EventStatus,
  type OpinionKind,
  type SessionFormat,
  type SessionStatus,
} from "./types.js";

/** 投稿の文字数上限の初期値。運用で調整する */
export const DEFAULT_OPINION_MAX_LENGTH = 300;
export const NAME_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 1000;
export const PROMPT_MAX_LENGTH = 300;

// 改行とタブ以外の制御文字
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_ALL = /[\u0000-\u001F\u007F]/g;
const SUBMISSION_ID = /^[A-Za-z0-9_-]{16,64}$/;

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest("invalid_body", "リクエストの本文はJSONオブジェクトで指定してください");
  }
  return value as Record<string, unknown>;
}

/** 文字数は、サロゲートペアを1文字として数える */
export function charLength(text: string): number {
  return Array.from(text).length;
}

function text(
  obj: Record<string, unknown>,
  key: string,
  label: string,
  max: number,
  { required }: { required: boolean },
): string | undefined {
  const raw = obj[key];
  if (raw === undefined || raw === null) {
    if (required) throw badRequest("required", `${label}を入力してください`);
    return undefined;
  }
  if (typeof raw !== "string") throw badRequest("invalid_type", `${label}は文字列で指定してください`);
  const value = raw.trim();
  if (required && value.length === 0) throw badRequest("required", `${label}を入力してください`);
  if (CONTROL_CHARS.test(value)) throw badRequest("invalid_characters", `${label}に使えない文字が含まれています`);
  if (charLength(value) > max) throw badRequest("too_long", `${label}は${max}文字以内で入力してください`);
  return value;
}

function oneOf<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  label: string,
  allowed: readonly T[],
  { required }: { required: boolean },
): T | undefined {
  const raw = obj[key];
  if (raw === undefined || raw === null) {
    if (required) throw badRequest("required", `${label}を指定してください`);
    return undefined;
  }
  if (typeof raw !== "string" || !allowed.includes(raw as T)) {
    throw badRequest("invalid_value", `${label}が正しくありません`);
  }
  return raw as T;
}

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
  if ("currentSessionId" in obj) {
    const value = obj["currentSessionId"];
    if (value !== null && (typeof value !== "string" || value.trim() === "" || value.length > 128)) {
      throw badRequest("invalid_current_session", "いまのテーマの指定が正しくありません");
    }
    patch.currentSessionId = value as string | null;
  }
  for (const key of ["acceptingProposals", "showPendingProposals"] as const) {
    if (key in obj) {
      if (typeof obj[key] !== "boolean") throw badRequest("invalid_type", `${key} は真偽値で指定してください`);
      patch[key] = obj[key] as boolean;
    }
  }
  if ("openSessionIds" in obj) {
    const value = obj["openSessionIds"];
    const valid =
      value === null ||
      (Array.isArray(value) && value.length <= MAX_OPEN_SESSIONS && value.every((v) => typeof v === "string" && v.trim() !== "" && v.length <= 128));
    if (!valid) throw badRequest("invalid_open_sessions", "開くテーマの指定が正しくありません");
    patch.openSessionIds = value === null ? null : [...new Set(value as string[])];
  }
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
}
export function parseSessionCreate(body: unknown): SessionInput {
  const obj = asObject(body);
  const show = obj["showOpinionsToParticipants"];
  if (show !== undefined && typeof show !== "boolean") {
    throw badRequest("invalid_type", "showOpinionsToParticipants は真偽値で指定してください");
  }
  return {
    title: text(obj, "title", "テーマ名", NAME_MAX_LENGTH, { required: true })!,
    prompt: text(obj, "prompt", "問い", PROMPT_MAX_LENGTH, { required: true })!,
    format: oneOf(obj, "format", "形式", SESSION_FORMATS, { required: false }) ?? "workshop",
    showOpinionsToParticipants: show ?? true,
  };
}

export interface SessionPatch {
  title?: string;
  prompt?: string;
  format?: SessionFormat;
  status?: SessionStatus;
  showOpinionsToParticipants?: boolean;
  summaryPublished?: boolean;
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
  return patch;
}

export interface OpinionInput {
  body: string;
  kind: OpinionKind;
  submissionId: string;
  editKey?: string;
}

/** 編集・削除の鍵。ブラウザが作る、推測できない乱数（128ビット以上） */
const EDIT_KEY = /^[A-Za-z0-9_-]{22,128}$/;
export function parseEditKey(value: unknown): string {
  if (typeof value !== "string" || !EDIT_KEY.test(value)) {
    throw badRequest("invalid_edit_key", "編集用の鍵が正しくありません");
  }
  return value;
}

/** リアクションの投票者を示す、ブラウザが作る乱数(128ビット以上) */
const VOTER_ID = /^[A-Za-z0-9_-]{22,128}$/;
export function parseReaction(body: unknown): { voterId: string; reacted: boolean } {
  const obj = asObject(body);
  const voterId = obj["voterId"];
  if (typeof voterId !== "string" || !VOTER_ID.test(voterId)) {
    throw badRequest("invalid_voter_id", "投票者のIDが正しくありません");
  }
  if (typeof obj["reacted"] !== "boolean") {
    throw badRequest("invalid_reacted", "reacted は true か false で指定してください");
  }
  return { voterId, reacted: obj["reacted"] };
}

export function parsePresence(body: unknown): { deviceId: string } {
  const deviceId = asObject(body)["deviceId"];
  if (typeof deviceId !== "string" || !VOTER_ID.test(deviceId)) {
    throw badRequest("invalid_device_id", "端末のIDが正しくありません");
  }
  return { deviceId };
}

export function parseOpinionCreate(body: unknown, maxLength = DEFAULT_OPINION_MAX_LENGTH): OpinionInput {
  const obj = asObject(body);
  const submissionId = obj["submissionId"];
  if (typeof submissionId !== "string" || !SUBMISSION_ID.test(submissionId)) {
    throw badRequest("invalid_submission_id", "送信IDが正しくありません");
  }
  return {
    body: text(obj, "body", "意見", maxLength, { required: true })!,
    kind: oneOf(obj, "kind", "投稿の種類", OPINION_KINDS, { required: true })!,
    submissionId,
    ...(obj["editKey"] === undefined ? {} : { editKey: parseEditKey(obj["editKey"]) }),
  };
}

export interface OpinionEdit {
  editKey: string;
  body: string;
  kind?: OpinionKind;
}
export function parseOpinionEdit(body: unknown, maxLength = DEFAULT_OPINION_MAX_LENGTH): OpinionEdit {
  const obj = asObject(body);
  const kind = oneOf(obj, "kind", "投稿の種類", OPINION_KINDS, { required: false });
  return {
    editKey: parseEditKey(obj["editKey"]),
    body: text(obj, "body", "意見", maxLength, { required: true })!,
    ...(kind === undefined ? {} : { kind }),
  };
}

export function parseEditKeyBody(body: unknown): string {
  return parseEditKey(asObject(body)["editKey"]);
}

export const MODERATION_STATUSES = ["active", "hidden", "deleted"] as const;
export function parseModeration(body: unknown): (typeof MODERATION_STATUSES)[number] {
  const status = oneOf(asObject(body), "status", "状態", MODERATION_STATUSES, { required: true });
  return status!;
}
