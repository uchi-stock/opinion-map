const KEY = "opinion-map-my-opinions";

/**
 * 自分が投稿した意見の、編集・削除用の鍵。投稿のIDと対にして、このブラウザにだけ保存する。
 * 鍵は投稿ごとの乱数で、サーバーにはハッシュしか残らない。人も、投稿どうしも結びつけない。
 * 保存できない環境（プライベートブラウズなど）では、編集・削除はできない。
 */
export function loadMyOpinions(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  } catch {
    return {};
  }
}

function save(map: Record<string, string>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // 保存できなくても、投稿自体は成功している
  }
}

export function rememberMyOpinion(opinionId: string, editKey: string): void {
  save({ ...loadMyOpinions(), [opinionId]: editKey });
}

export function forgetMyOpinion(opinionId: string): void {
  const { [opinionId]: _removed, ...rest } = loadMyOpinions();
  save(rest);
}

/** 編集・削除用の鍵を作る。128ビット以上の乱数を、URLに使える文字にする */
export function newEditKey(): string {
  const bytes = new Uint8Array(24);
  const c: Crypto | undefined = typeof crypto === "undefined" ? undefined : crypto;
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
