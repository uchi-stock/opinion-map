/**
 * 公開するときの基準パスへの対応。GitHub Pages では、/opinion-map/ のように、
 * サイトの途中のパスから配信されるため、リンクと画面の判定に基準パスを足し引きする。
 * 通常（基準パスが / のとき）は、何もしない。
 */
export function basePath(baseUrl: string = import.meta.env.BASE_URL): string {
  return baseUrl.replace(/\/+$/, "");
}

export function withBase(path: string, baseUrl?: string): string {
  return basePath(baseUrl) + path;
}

export function stripBase(pathname: string, baseUrl?: string): string {
  const base = basePath(baseUrl);
  if (base && (pathname === base || pathname.startsWith(`${base}/`))) {
    return pathname.slice(base.length) || "/";
  }
  return pathname;
}
