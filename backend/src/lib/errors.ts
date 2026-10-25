export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const unauthorized = () => new AppError(401, "unauthorized", "認証が必要です");
export const forbidden = (code: string, message: string) => new AppError(403, code, message);
export const notFound = (what: string) => new AppError(404, "not_found", `${what}が見つかりません`);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
