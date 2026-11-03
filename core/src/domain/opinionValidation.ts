import { badRequest } from "../lib/errors.js";
import { OPINION_KINDS, type OpinionKind } from "./types.js";
import { DEFAULT_OPINION_MAX_LENGTH, SUBMISSION_ID, asObject, text, oneOf } from "./validationHelpers.js";

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

/** 話した内容の文字の長さの上限(1回あたり)。長い内容は、画面が分けて送る */
export const TRANSCRIPT_MAX_LENGTH = 4000;

/** 付箋の候補を作るための、話した内容の文字 */
export function parseTranscript(body: unknown): { text: string } {
  const value = text(asObject(body), "text", "話した内容の文字", TRANSCRIPT_MAX_LENGTH, { required: true });
  return { text: value! };
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
