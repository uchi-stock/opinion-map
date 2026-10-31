/**
 * 運用監視のための、構造化ログ。1行のJSONで出す。CloudWatch のメトリクスフィルタが、event の値で数える。
 * 投稿の本文、メールアドレス、トークンは、入れない(呼び出し側で、短い識別子と数だけを渡す)。
 */
export type LogFields = Record<string, string | number | boolean>;
export type Logger = (event: string, fields?: LogFields) => void;

export const consoleLogger: Logger = (event, fields = {}) => {
  console.log(JSON.stringify({ level: "error", event, ...fields }));
};
