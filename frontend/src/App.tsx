import { AdminEventEditPage } from "./pages/admin/AdminEventEditPage.tsx";
import { AdminEventInvitePage } from "./pages/admin/AdminEventInvitePage.tsx";
import { AdminEventPage } from "./pages/admin/AdminEventPage.tsx";
import { AdminEventsPage } from "./pages/admin/AdminEventsPage.tsx";
import { AdminSessionNewPage } from "./pages/admin/AdminSessionNewPage.tsx";
import { AdminSessionEditPage, AdminSessionNotesPage } from "./pages/admin/AdminSessionSubPages.tsx";
import { AdminSessionPage } from "./pages/admin/AdminSessionPage.tsx";
import { stripBase, withBase } from "./lib/paths.ts";
import { ParticipantEventPage } from "./pages/ParticipantEventPage.tsx";
import { ParticipantPage } from "./pages/ParticipantPage.tsx";
import { TopPage } from "./pages/TopPage.tsx";

export type Route =
  | { page: "top" }
  | { page: "session"; sessionId: string }
  | { page: "event"; eventId: string }
  | { page: "adminEvents" }
  | { page: "adminEvent"; eventId: string }
  | { page: "adminEventEdit"; eventId: string }
  | { page: "adminEventInvite"; eventId: string }
  | { page: "adminSessionNew"; eventId: string }
  | { page: "adminSessionEdit"; eventId: string; sessionId: string }
  | { page: "adminSessionNotes"; eventId: string; sessionId: string }
  | { page: "adminSession"; eventId: string; sessionId: string }
  | { page: "notFound" };

/** 参加者の招待URLは /e/<イベントID>(テーマは運営者が切り替える)。/s/<テーマID> も使える。運営者の画面は /admin 以下 */
export function routeOf(pathname: string): Route {
  if (pathname === "/" || pathname === "") return { page: "top" };
  const session = /^\/s\/([^/]+)\/?$/.exec(pathname);
  if (session?.[1]) return { page: "session", sessionId: decodeURIComponent(session[1]) };
  const eventPage = /^\/e\/([^/]+)\/?$/.exec(pathname);
  if (eventPage?.[1]) return { page: "event", eventId: decodeURIComponent(eventPage[1]) };
  if (/^\/admin\/?$/.test(pathname)) return { page: "adminEvents" };
  const event = /^\/admin\/events\/([^/]+)\/?$/.exec(pathname);
  if (event?.[1]) return { page: "adminEvent", eventId: decodeURIComponent(event[1]) };
  const eventEdit = /^\/admin\/events\/([^/]+)\/edit\/?$/.exec(pathname);
  if (eventEdit?.[1]) return { page: "adminEventEdit", eventId: decodeURIComponent(eventEdit[1]) };
  const eventInvite = /^\/admin\/events\/([^/]+)\/invite\/?$/.exec(pathname);
  if (eventInvite?.[1]) return { page: "adminEventInvite", eventId: decodeURIComponent(eventInvite[1]) };
  // 「new」は、テーマのIDではなく、追加の画面。テーマのURLより先に判定する
  const sessionNew = /^\/admin\/events\/([^/]+)\/sessions\/new\/?$/.exec(pathname);
  if (sessionNew?.[1]) return { page: "adminSessionNew", eventId: decodeURIComponent(sessionNew[1]) };
  for (const [name, page] of [["edit", "adminSessionEdit"], ["notes", "adminSessionNotes"]] as const) {
    const sub = new RegExp(`^/admin/events/([^/]+)/sessions/([^/]+)/${name}/?$`).exec(pathname);
    if (sub?.[1] && sub[2]) return { page, eventId: decodeURIComponent(sub[1]), sessionId: decodeURIComponent(sub[2]) };
  }
  const adminSession = /^\/admin\/events\/([^/]+)\/sessions\/([^/]+)\/?$/.exec(pathname);
  if (adminSession?.[1] && adminSession[2]) {
    return {
      page: "adminSession",
      eventId: decodeURIComponent(adminSession[1]),
      sessionId: decodeURIComponent(adminSession[2]),
    };
  }
  return { page: "notFound" };
}

export function App({ pathname = window.location.pathname }: { pathname?: string }) {
  const route = routeOf(stripBase(pathname));
  if (route.page === "top") return <TopPage />;
  if (route.page === "session") return <ParticipantPage sessionId={route.sessionId} />;
  if (route.page === "event") return <ParticipantEventPage eventId={route.eventId} />;
  if (route.page === "adminEvents") return <AdminEventsPage />;
  if (route.page === "adminEvent") return <AdminEventPage eventId={route.eventId} />;
  if (route.page === "adminEventEdit") return <AdminEventEditPage eventId={route.eventId} />;
  if (route.page === "adminEventInvite") return <AdminEventInvitePage eventId={route.eventId} />;
  if (route.page === "adminSessionNew") return <AdminSessionNewPage eventId={route.eventId} />;
  if (route.page === "adminSessionEdit") return <AdminSessionEditPage eventId={route.eventId} sessionId={route.sessionId} />;
  if (route.page === "adminSessionNotes") return <AdminSessionNotesPage eventId={route.eventId} sessionId={route.sessionId} />;
  if (route.page === "adminSession") return <AdminSessionPage eventId={route.eventId} sessionId={route.sessionId} />;
  return (
    <main className="container py-4" style={{ maxWidth: 640 }}>
      <h1 className="h4">ページが見つかりません</h1>
      <p>
        <a href={withBase("/")}>トップページへ</a>
      </p>
    </main>
  );
}
