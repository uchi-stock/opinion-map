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

export interface EventPatch {
  name?: string;
  description?: string;
  status?: EventStatus;
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
  return patch;
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
    title: text(obj, "title", "セッション名", NAME_MAX_LENGTH, { required: true })!,
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
}
export function parseSessionPatch(body: unknown): SessionPatch {
  const obj = asObject(body);
  const patch: SessionPatch = {};
  const title = text(obj, "title", "セッション名", NAME_MAX_LENGTH, { required: false });
  if (title !== undefined) {
    if (title.length === 0) throw badRequest("required", "セッション名を入力してください");
    patch.title = title;
  }
  const prompt = text(obj, "prompt", "問い", PROMPT_MAX_LENGTH, { required: false });
  if (prompt !== undefined) {
    if (prompt.length === 0) throw badRequest("required", "問いを入力してください");
    patch.prompt = prompt;
  }
  const format = oneOf(obj, "format", "形式", SESSION_FORMATS, { required: false });
  if (format !== undefined) patch.format = format;
  const status = oneOf(obj, "status", "セッションの状態", SESSION_STATUSES, { required: false });
  if (status !== undefined) patch.status = status;
  const show = obj["showOpinionsToParticipants"];
  if (show !== undefined) {
    if (typeof show !== "boolean") throw badRequest("invalid_type", "showOpinionsToParticipants は真偽値で指定してください");
    patch.showOpinionsToParticipants = show;
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
