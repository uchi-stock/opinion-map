const VOTER_KEY = "opinion-map-voter";
const REACTED_KEY = "opinion-map-reacted";

/**
 * いいねの投票者を示す乱数。このブラウザにだけ保存し、サーバーにはハッシュしか残らない。
 * 人は特定しない。保存できない環境(プライベートブラウズなど)では、ページを開いている間だけ有効。
 */
let memoryVoterId: string | undefined;

function randomId(): string {
  const bytes = new Uint8Array(24);
  const c: Crypto | undefined = typeof crypto === "undefined" ? undefined : crypto;
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function getVoterId(): string {
  try {
    const saved = window.localStorage.getItem(VOTER_KEY);
    if (saved) return saved;
    const created = randomId();
    window.localStorage.setItem(VOTER_KEY, created);
    return created;
  } catch {
    memoryVoterId ??= randomId();
    return memoryVoterId;
  }
}

/** このブラウザで、いいねを付けた投稿のID */
export function loadReacted(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(REACTED_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveReacted(ids: Set<string>): void {
  try {
    window.localStorage.setItem(REACTED_KEY, JSON.stringify([...ids]));
  } catch {
    // 保存できなくても、いいね自体は成功している
  }
}
