import { badRequest } from "../lib/errors.js";

/** 投稿の文字数上限の初期値。運用で調整する */
export const DEFAULT_OPINION_MAX_LENGTH = 300;
export const NAME_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 1000;
export const PROMPT_MAX_LENGTH = 300;

// 改行とタブ以外の制御文字
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
// eslint-disable-next-line no-control-regex
export const CONTROL_CHARS_ALL = /[\u0000-\u001F\u007F]/g;
export const SUBMISSION_ID = /^[A-Za-z0-9_-]{16,64}$/;

export function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest("invalid_body", "リクエストの本文はJSONオブジェクトで指定してください");
  }
  return value as Record<string, unknown>;
}

/** 文字数は、サロゲートペアを1文字として数える */
export function charLength(text: string): number {
  return Array.from(text).length;
}

export function text(
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

export function oneOf<T extends string>(
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
