import type { ReactNode } from "react";
import type { AdminApi } from "../../api/admin.ts";
import type { EventRecord, SessionRecord } from "../../api/types.ts";
import { AdminShell } from "../../components/admin/AdminShell.tsx";
import { NotesEditor } from "../../components/admin/NotesEditor.tsx";
import { withBase } from "../../lib/paths.ts";
import { useLoad } from "../../lib/useLoad.ts";
import { latestAnalysis, SessionForm } from "./AdminSessionPage.tsx";

type Draft = Parameters<typeof NotesEditor>[0]["draftSource"];

interface Context {
  api: AdminApi;
  describeError: (e: unknown) => string;
  event: EventRecord;
  session: SessionRecord;
  draftSource: Draft;
  reload: () => Promise<void>;
}

/** テーマの下に置く、ひとつの目的の画面の共通の枠。戻る先は、テーマのページ */
function ThemeSubPage({ eventId, sessionId, title, children }: { eventId: string; sessionId: string; title: string; children: (ctx: Context) => ReactNode }) {
  const themePath = withBase(`/admin/events/${encodeURIComponent(eventId)}/sessions/${encodeURIComponent(sessionId)}`);
  return (
    <AdminShell title={title} back={{ href: themePath, label: "テーマ" }}>
      {({ api, describeError }) => (
        <Loaded api={api} describeError={describeError} eventId={eventId} sessionId={sessionId}>
          {children}
        </Loaded>
      )}
    </AdminShell>
  );
}

function Loaded({
  api,
  describeError,
  eventId,
  sessionId,
  children,
}: {
  api: AdminApi;
  describeError: (e: unknown) => string;
  eventId: string;
  sessionId: string;
  children: (ctx: Context) => ReactNode;
}) {
  const { state, reload } = useLoad(
    async () => {
      const [events, sessions, latest] = await Promise.all([api.listEvents(), api.listSessions(eventId), latestAnalysis(api, sessionId)]);
      const event = events.find((e) => e.id === eventId);
      const session = sessions.find((s) => s.id === sessionId);
      if (!event || !session) throw new Error("not_found");
      const result = latest?.run.result;
      const draftSource: Draft = result
        ? {
            overview: result.overview,
            clusterTitles: result.clusters.filter((c) => c.level === Math.min(...result.clusters.map((x) => x.level))).map((c) => c.title),
            questions: latest.insights.flatMap((i) => (i.edited ?? i.ai).questions),
          }
        : null;
      return { event, session, draftSource };
    },
    (e) => (e instanceof Error && e.message === "not_found" ? "テーマが見つかりません。" : describeError(e)),
    [api, eventId, sessionId],
  );
  if (state.status === "loading") return <p role="status">読み込んでいます…</p>;
  if (state.status === "error")
    return (
      <div className="alert alert-danger" role="alert">
        {state.message}
      </div>
    );
  return <>{children({ api, describeError, ...state.data, reload })}</>;
}

/** テーマの設定(名前、問い、形式、状態、意見を見せるか) */
export function AdminSessionEditPage({ eventId, sessionId }: { eventId: string; sessionId: string }) {
  return (
    <ThemeSubPage eventId={eventId} sessionId={sessionId} title="テーマの設定">
      {({ api, session, describeError, reload }) => <SessionForm api={api} session={session} describeError={describeError} onSaved={reload} />}
    </ThemeSubPage>
  );
}

/** 議論の記録(結論、次の行動、未解決の問い)。分析があれば、要約から下書きを取り込める */
export function AdminSessionNotesPage({ eventId, sessionId }: { eventId: string; sessionId: string }) {
  return (
    <ThemeSubPage eventId={eventId} sessionId={sessionId} title="議論の記録">
      {({ api, session, describeError, draftSource }) => (
        <NotesEditor
          api={api}
          sessionId={session.id}
          initial={session.notes}
          initialPublished={session.notesPublished === true}
          describeError={describeError}
          draftSource={draftSource}
        />
      )}
    </ThemeSubPage>
  );
}
