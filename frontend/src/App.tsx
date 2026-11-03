import type { ReactNode } from "react";
import { AdminAdminsPage } from "./pages/admin/AdminAdminsPage.tsx";
import { AdminEventEditPage } from "./pages/admin/AdminEventEditPage.tsx";
import { AdminEventInvitePage } from "./pages/admin/AdminEventInvitePage.tsx";
import { AdminEventNewPage } from "./pages/admin/AdminEventNewPage.tsx";
import { AdminEventPage } from "./pages/admin/AdminEventPage.tsx";
import { AdminNotesPage, AdminProposalsPage, AdminUsagePage } from "./pages/admin/AdminEventSubPages.tsx";
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
  | { page: "adminEventNew" }
  | { page: "adminAdmins" }
  | { page: "adminEvent"; eventId: string }
  | { page: "adminEventProposals"; eventId: string }
  | { page: "adminEventNotes"; eventId: string }
  | { page: "adminEventUsage"; eventId: string }
  | { page: "adminEventEdit"; eventId: string }
  | { page: "adminEventInvite"; eventId: string }
  | { page: "adminSessionNew"; eventId: string }
  | { page: "adminSessionEdit"; eventId: string; sessionId: string }
  | { page: "adminSessionNotes"; eventId: string; sessionId: string }
  | { page: "adminSession"; eventId: string; sessionId: string }
  | { page: "notFound" };

const dec = (value: string | undefined) => decodeURIComponent(value ?? "");

/**
 * パスと画面の対応表。上から順に調べ、最初に合ったものを使う。
 * 「new」は ID ではなく作る画面なので、ID を受ける行より先に置く。
 */
const ROUTE_TABLE: { pattern: RegExp; build: (m: RegExpExecArray) => Route }[] = [
  { pattern: /^\/s\/([^/]+)\/?$/, build: (m) => ({ page: "session", sessionId: dec(m[1]) }) },
  { pattern: /^\/e\/([^/]+)\/?$/, build: (m) => ({ page: "event", eventId: dec(m[1]) }) },
  { pattern: /^\/admin\/?$/, build: () => ({ page: "adminEvents" }) },
  { pattern: /^\/admin\/events\/new\/?$/, build: () => ({ page: "adminEventNew" }) },
  { pattern: /^\/admin\/admins\/?$/, build: () => ({ page: "adminAdmins" }) },
  { pattern: /^\/admin\/events\/([^/]+)\/proposals\/?$/, build: (m) => ({ page: "adminEventProposals", eventId: dec(m[1]) }) },
  { pattern: /^\/admin\/events\/([^/]+)\/notes\/?$/, build: (m) => ({ page: "adminEventNotes", eventId: dec(m[1]) }) },
  { pattern: /^\/admin\/events\/([^/]+)\/usage\/?$/, build: (m) => ({ page: "adminEventUsage", eventId: dec(m[1]) }) },
  { pattern: /^\/admin\/events\/([^/]+)\/?$/, build: (m) => ({ page: "adminEvent", eventId: dec(m[1]) }) },
  { pattern: /^\/admin\/events\/([^/]+)\/edit\/?$/, build: (m) => ({ page: "adminEventEdit", eventId: dec(m[1]) }) },
  { pattern: /^\/admin\/events\/([^/]+)\/invite\/?$/, build: (m) => ({ page: "adminEventInvite", eventId: dec(m[1]) }) },
  { pattern: /^\/admin\/events\/([^/]+)\/sessions\/new\/?$/, build: (m) => ({ page: "adminSessionNew", eventId: dec(m[1]) }) },
  {
    pattern: /^\/admin\/events\/([^/]+)\/sessions\/([^/]+)\/edit\/?$/,
    build: (m) => ({ page: "adminSessionEdit", eventId: dec(m[1]), sessionId: dec(m[2]) }),
  },
  {
    pattern: /^\/admin\/events\/([^/]+)\/sessions\/([^/]+)\/notes\/?$/,
    build: (m) => ({ page: "adminSessionNotes", eventId: dec(m[1]), sessionId: dec(m[2]) }),
  },
  {
    pattern: /^\/admin\/events\/([^/]+)\/sessions\/([^/]+)\/?$/,
    build: (m) => ({ page: "adminSession", eventId: dec(m[1]), sessionId: dec(m[2]) }),
  },
];

/** 参加者の招待URLは /e/<イベントID>(テーマは運営者が切り替える)。/s/<テーマID> も使える。運営者の画面は /admin 以下 */
export function routeOf(pathname: string): Route {
  if (pathname === "/" || pathname === "") return { page: "top" };
  for (const { pattern, build } of ROUTE_TABLE) {
    const match = pattern.exec(pathname);
    if (match) return build(match);
  }
  return { page: "notFound" };
}

type PageRenderers = { [P in Route["page"]]: (route: Extract<Route, { page: P }>) => ReactNode };

/** 画面ごとの描画。Route に画面を足すと、ここにも足さないと型が通らない */
const RENDER: PageRenderers = {
  top: () => <TopPage />,
  session: (r) => <ParticipantPage sessionId={r.sessionId} />,
  event: (r) => <ParticipantEventPage eventId={r.eventId} />,
  adminEvents: () => <AdminEventsPage />,
  adminEventNew: () => <AdminEventNewPage />,
  adminAdmins: () => <AdminAdminsPage />,
  adminEventProposals: (r) => <AdminProposalsPage eventId={r.eventId} />,
  adminEventNotes: (r) => <AdminNotesPage eventId={r.eventId} />,
  adminEventUsage: (r) => <AdminUsagePage eventId={r.eventId} />,
  adminEvent: (r) => <AdminEventPage eventId={r.eventId} />,
  adminEventEdit: (r) => <AdminEventEditPage eventId={r.eventId} />,
  adminEventInvite: (r) => <AdminEventInvitePage eventId={r.eventId} />,
  adminSessionNew: (r) => <AdminSessionNewPage eventId={r.eventId} />,
  adminSessionEdit: (r) => <AdminSessionEditPage eventId={r.eventId} sessionId={r.sessionId} />,
  adminSessionNotes: (r) => <AdminSessionNotesPage eventId={r.eventId} sessionId={r.sessionId} />,
  adminSession: (r) => <AdminSessionPage eventId={r.eventId} sessionId={r.sessionId} />,
  notFound: () => (
    <main className="container py-4" style={{ maxWidth: 640 }}>
      <h1 className="h4">ページが見つかりません</h1>
      <p>
        <a href={withBase("/")}>トップページへ</a>
      </p>
    </main>
  ),
};

export function App({ pathname = window.location.pathname }: { pathname?: string }) {
  const route = routeOf(stripBase(pathname));
  // 画面の種類ごとに型が決まるため、描画の関数を型の上で取り出す
  const render = RENDER[route.page] as (r: Route) => ReactNode;
  return render(route);
}
