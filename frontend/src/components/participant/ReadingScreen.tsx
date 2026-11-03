import type { PublicSession, PublicSummaryResponse } from "../../api/types.ts";
import { SummaryView } from "../SummaryView.tsx";
import { ViewTabs, type ContentView } from "../ViewTabs.tsx";
import type { ViewMode } from "../StickyBoard.tsx";
import { OpinionsSection } from "./OpinionsSection.tsx";
import type { ListState } from "./types.ts";

/** 基本の画面。要約か、投稿へのリンクと投稿された意見 */
export function ReadingScreen({
  session,
  summary,
  view,
  setView,
  listState,
  mode,
  setMode,
  posted,
  onPostLink,
  mine,
  reload,
  onDeleted,
}: {
  session: PublicSession;
  summary: PublicSummaryResponse | null;
  view: ContentView;
  setView: (view: ContentView) => void;
  listState: ListState;
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  posted: boolean;
  onPostLink: () => void;
  mine: Record<string, string>;
  reload: () => void;
  onDeleted: (id: string) => void;
}) {
  return (
    <>
      <ViewTabs view={view} onChange={setView} summaryAvailable={summary?.published === true} />
      {view === "summary" && summary?.published === true ? (
        <SummaryView
          audience="participant"
          opinions={listState.status === "ready" ? listState.list.opinions : []}
          data={{
            overview: summary.overview,
            clusters: summary.clusters,
            unclassifiedCount: summary.unclassifiedCount,
            ...(summary.unclassifiedOpinionIds ? { unclassifiedOpinionIds: summary.unclassifiedOpinionIds } : {}),
            insights: summary.insights.map((i) => ({ ...i, approved: true })),
            newOpinionCount: summary.newOpinionCount,
          }}
        />
      ) : (
        <>
      {posted && (
        <div className="alert alert-success" role="status">
          投稿しました。ありがとうございます。
        </div>
      )}
      <section className="mb-3" aria-label="投稿する">
        {session.acceptingOpinions ? (
          <a
            className="btn icon-btn btn-primary w-100"
            href="#post"
            onClick={onPostLink}
            aria-label="意見を投稿する"
            title="意見を投稿する"
          >
            ✍️
          </a>
        ) : (
          <div className="alert alert-secondary mb-0" role="status">
            現在、投稿を受け付けていません。
          </div>
        )}
      </section>

      {session.showOpinions && (
        <OpinionsSection session={session} listState={listState} mode={mode} setMode={setMode} mine={mine} reload={reload} onDeleted={onDeleted} />
      )}
        </>
      )}
    </>
  );
}
