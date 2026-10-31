import { useEffect } from "react";
import type { AdminApi } from "../../api/admin.ts";
import { AdminShell } from "../../components/admin/AdminShell.tsx";
import { Avatar } from "../../components/admin/Avatar.tsx";
import { EVENT_STATUS_LABELS, formatDate } from "../../lib/labels.ts";
import { withBase } from "../../lib/paths.ts";
import { useLoad } from "../../lib/useLoad.ts";
import { useMe } from "../../lib/useMe.ts";

export function AdminEventsPage() {
  return (
    <AdminShell title="イベント">
      {({ api, describeError }) => <EventsContent api={api} describeError={describeError} />}
    </AdminShell>
  );
}

function EventsContent({
  api,
  describeError,
}: {
  api: AdminApi;
  describeError: (e: unknown) => string;
}) {
  const { state } = useLoad(() => api.listEvents(), describeError, [api]);
  const me = useMe(api);
  const isOperator = me?.role === "operator";

  // 運営者のトークン(担当のイベントだけ操作できる人)は、一覧に用がない。自分のイベントのページへ、すぐ移す
  useEffect(() => {
    if (isOperator && state.status === "ready" && state.data.length === 1) {
      window.location.replace(withBase(`/admin/events/${encodeURIComponent(state.data[0]!.id)}`));
    }
  }, [isOperator, state]);

  return (
    <>
      {/* 作る・管理者は、オーナーだけが使う。運営者のトークンの人には、出さない */}
      {me?.role === "owner" && (
        <div className="d-flex gap-2 mb-3">
          <a className="btn icon-btn btn-primary flex-grow-1" href={withBase("/admin/events/new")} aria-label="イベントを作る" title="イベントを作る">➕</a>
          <a className="btn icon-btn btn-outline-secondary" href={withBase("/admin/admins")} aria-label="管理者" title="管理者">👥</a>
        </div>
      )}
      <section className="mb-4" aria-label="イベント一覧">
        {state.status === "loading" && <p role="status">読み込んでいます…</p>}
        {state.status === "error" && (
          <div className="alert alert-danger" role="alert">
            {state.message}
          </div>
        )}
        {state.status === "ready" && state.data.length === 0 && (
          <p className="text-body-secondary">まだイベントがありません。「イベントを作る」から作ってください。</p>
        )}
        {state.status === "ready" &&
          state.data.map((event) => (
            <a
              key={event.id}
              href={withBase(`/admin/events/${encodeURIComponent(event.id)}`)}
              className="card mb-2 text-decoration-none"
            >
              <div className="card-body py-2 d-flex justify-content-between align-items-center gap-2">
                <span className="d-flex align-items-center gap-2 min-w-0">
                  {event.createdBy !== undefined && (
                    <Avatar
                      email={event.createdBy.startsWith("(") ? undefined : event.createdBy}
                      picture={event.creatorPicture}
                      size={32}
                      label={`作成者: ${event.createdBy.startsWith("(") ? "トークン" : event.createdBy}`}
                    />
                  )}
                  <span className="text-body">
                    {event.name}
                    <span className="d-block small text-body-secondary">作成日 {formatDate(event.createdAt)}</span>
                  </span>
                </span>
                <span className="badge text-bg-secondary flex-shrink-0">{EVENT_STATUS_LABELS[event.status]}</span>
              </div>
            </a>
          ))}
      </section>
    </>
  );
}
