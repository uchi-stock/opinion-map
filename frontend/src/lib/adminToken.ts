const KEY = "opinion-map-admin-token";

/**
 * 運営者のトークンは、このブラウザにだけ保存する。
 * プライベートブラウズなどで保存できない環境でも、例外を投げない（その場合は、毎回入力する）。
 */
export function loadAdminToken(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveAdminToken(token: string): void {
  try {
    window.localStorage.setItem(KEY, token);
  } catch {
    // 保存できなくても、この画面の間は使える
  }
}

export function clearAdminToken(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
}
