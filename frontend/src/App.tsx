import { ParticipantPage } from "./pages/ParticipantPage.tsx";
import { TopPage } from "./pages/TopPage.tsx";

/** 参加者のURLは /s/<セッションID> */
export function routeOf(pathname: string): { page: "top" } | { page: "session"; sessionId: string } | { page: "notFound" } {
  if (pathname === "/" || pathname === "") return { page: "top" };
  const match = /^\/s\/([^/]+)\/?$/.exec(pathname);
  if (match?.[1]) return { page: "session", sessionId: decodeURIComponent(match[1]) };
  return { page: "notFound" };
}

export function App({ pathname = window.location.pathname }: { pathname?: string }) {
  const route = routeOf(pathname);
  if (route.page === "top") return <TopPage />;
  if (route.page === "session") return <ParticipantPage sessionId={route.sessionId} />;
  return (
    <main className="container py-4" style={{ maxWidth: 640 }}>
      <h1 className="h4">ページが見つかりません</h1>
      <p>
        <a href="/">トップページへ</a>
      </p>
    </main>
  );
}
