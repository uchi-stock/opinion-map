export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  // 型だけで消去できる書き方にする（フロントエンドのデモ版が、同じコードをビルドするため）
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const unauthorized = () => new AppError(401, "unauthorized", "認証が必要です");
export const forbidden = (code: string, message: string) => new AppError(403, code, message);
export const notFound = (what: string) => new AppError(404, "not_found", `${what}が見つかりません`);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
