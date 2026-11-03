import type { OpinionList } from "../../api/types.ts";

/** 投稿された意見の一覧の読み込みの状態 */
export type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; list: OpinionList };
