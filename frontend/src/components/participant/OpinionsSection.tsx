import type { PublicSession } from "../../api/types.ts";
import { MyOpinionActions } from "../MyOpinionActions.tsx";
import { OpinionCard } from "../OpinionCard.tsx";
import { ReactionButton } from "../ReactionButton.tsx";
import { StickyBoard, ViewToggle, type ViewMode } from "../StickyBoard.tsx";
import { groupByKind } from "../../lib/board.ts";
import type { ListState } from "./types.ts";

/** 投稿された意見。ボードか一覧で見せる。一覧では、自分の投稿を編集・削除できる */
export function OpinionsSection({
  session,
  listState,
  mode,
  setMode,
  mine,
  reload,
  onDeleted,
}: {
  session: PublicSession;
  listState: ListState;
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  mine: Record<string, string>;
  reload: () => void;
  onDeleted: (id: string) => void;
}) {
  return (
  <section aria-label="投稿された意見">
    <div className="d-flex justify-content-between align-items-center mb-2">
      <h2 className="h6 mb-0">投稿された意見</h2>
      <div className="d-flex gap-2">
        <ViewToggle mode={mode} onChange={setMode} />
        <button type="button" className="btn icon-btn btn-sm btn-outline-secondary" onClick={() => reload()} aria-label="更新" title="更新">🔄</button>
      </div>
    </div>
    {listState.status === "loading" && <p role="status">読み込んでいます…</p>}
    {listState.status === "error" && (
      <div className="alert alert-warning" role="alert">
        {listState.message}
      </div>
    )}
    {listState.status === "ready" && listState.list.opinions.length === 0 && (
      <p className="text-body-secondary">まだ投稿はありません。</p>
    )}
    {listState.status === "ready" && mode === "board" && (
      <StickyBoard
        groups={groupByKind(listState.list.opinions)}
        renderActions={(o) => (
          <ReactionButton
            opinionId={o.id}
            count={o.reactionCount ?? 0}
            disabled={!session.acceptingOpinions}
            onChanged={() => reload()}
          />
        )}
      />
    )}
    {listState.status === "ready" &&
      mode === "list" &&
      [...listState.list.opinions].reverse().map((o) => (
        <div key={o.id}>
          <OpinionCard
            opinion={o}
            actions={
              <ReactionButton
                opinionId={o.id}
                count={o.reactionCount ?? 0}
                disabled={!session.acceptingOpinions}
                onChanged={() => reload()}
              />
            }
          />
          {mine[o.id] && (
            <MyOpinionActions
              opinion={o}
              editKey={mine[o.id]!}
              canEdit={session.acceptingOpinions}
              onEdited={() => reload()}
              onDeleted={onDeleted}
            />
          )}
        </div>
      ))}
  </section>
  );
}
