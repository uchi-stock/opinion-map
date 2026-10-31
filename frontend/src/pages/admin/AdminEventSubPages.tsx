import type { ReactNode } from "react";
import type { AdminApi } from "../../api/admin.ts";
import type { EventRecord, SessionRecord } from "../../api/types.ts";
import { AdminShell } from "../../components/admin/AdminShell.tsx";
import { NotesOverview } from "../../components/admin/NotesOverview.tsx";
import { OperatorTokenSection } from "../../components/admin/OperatorTokenSection.tsx";
import { ProposalAdminSection } from "../../components/admin/ProposalAdminSection.tsx";
import { UsageSection } from "../../components/admin/UsageSection.tsx";
import { withBase } from "../../lib/paths.ts";
import { useLoad } from "../../lib/useLoad.ts";
import { useMe } from "../../lib/useMe.ts";

interface Context {
  api: AdminApi;
  describeError: (e: unknown) => string;
  event: EventRecord;
  sessions: SessionRecord[];
  reload: () => Promise<void>;
}

/** イベントの下に置く、ひとつの目的の画面の共通の枠。戻る先は、イベントのページ */
function EventSubPage({ eventId, title, children }: { eventId: string; title: string; children: (ctx: Context) => ReactNode }) {
  return (
    <AdminShell title={title} back={{ href: withBase(`/admin/events/${encodeURIComponent(eventId)}`), label: "イベント" }}>
      {({ api, describeError }) => <Loaded api={api} describeError={describeError} eventId={eventId}>{children}</Loaded>}
    </AdminShell>
  );
}

function Loaded({
  api,
  describeError,
  eventId,
  children,
}: {
  api: AdminApi;
  describeError: (e: unknown) => string;
  eventId: string;
  children: (ctx: Context) => ReactNode;
}) {
  const { state, reload } = useLoad(
    async () => {
      const [events, sessions] = await Promise.all([api.listEvents(), api.listSessions(eventId)]);
      const event = events.find((e) => e.id === eventId);
      if (!event) throw new Error("not_found");
      return { event, sessions };
    },
    (e) => (e instanceof Error && e.message === "not_found" ? "イベントが見つかりません。" : describeError(e)),
    [api, eventId],
  );
  if (state.status === "loading") return <p role="status">読み込んでいます…</p>;
  if (state.status === "error")
    return (
      <div className="alert alert-danger" role="alert">
        {state.message}
      </div>
    );
  return <>{children({ api, describeError, event: state.data.event, sessions: state.data.sessions, reload })}</>;
}

/** 議題の提案(OST)の受け付けと、承認・却下・統合 */
export function AdminProposalsPage({ eventId }: { eventId: string }) {
  return (
    <EventSubPage eventId={eventId} title="議題の提案">
      {({ api, describeError, event, sessions, reload }) => (
        <ProposalAdminSection api={api} event={event} sessions={sessions} describeError={describeError} onChanged={reload} />
      )}
    </EventSubPage>
  );
}

/** 全テーマの議論の記録を、1画面で見て、コピーする */
export function AdminNotesPage({ eventId }: { eventId: string }) {
  return (
    <EventSubPage eventId={eventId} title="全テーマの記録">
      {({ api, describeError, event }) => <NotesOverview api={api} eventId={eventId} eventName={event.name} describeError={describeError} />}
    </EventSubPage>
  );
}

/** このイベントだけを操作できる運営者のリンクの発行と失効。オーナーだけが使える */
export function AdminOperatorsPage({ eventId }: { eventId: string }) {
  return (
    <EventSubPage eventId={eventId} title="運営者のリンク">
      {({ api, describeError }) => <OperatorsContent api={api} eventId={eventId} describeError={describeError} />}
    </EventSubPage>
  );
}

function OperatorsContent({ api, eventId, describeError }: { api: AdminApi; eventId: string; describeError: (e: unknown) => string }) {
  const me = useMe(api);
  if (me === undefined) return <p role="status">読み込んでいます…</p>;
  if (me?.role === "operator") return <p className="text-body-secondary">この画面は、オーナーだけが使えます。</p>;
  return <OperatorTokenSection api={api} eventId={eventId} describeError={describeError} />;
}

/** AI(分析と案の生成)の、今日の使用量 */
export function AdminUsagePage({ eventId }: { eventId: string }) {
  return (
    <EventSubPage eventId={eventId} title="AIの利用状況">
      {({ api, describeError }) => <UsageSection api={api} eventId={eventId} describeError={describeError} />}
    </EventSubPage>
  );
}
