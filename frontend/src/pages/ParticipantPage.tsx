import { useCallback, useEffect, useState } from "react";
import { ApiError, getSession, listOpinions } from "../api/client.ts";
import type { OpinionList, OpinionResult, PublicSession } from "../api/types.ts";
import { OpinionCard } from "../components/OpinionCard.tsx";
import { MyOpinionActions } from "../components/MyOpinionActions.tsx";
import { ReactionButton } from "../components/ReactionButton.tsx";
import { StickyBoard, ViewToggle, type ViewMode } from "../components/StickyBoard.tsx";
import { groupByKind } from "../lib/board.ts";
import { OpinionForm } from "../components/OpinionForm.tsx";
import { forgetMyOpinion, loadMyOpinions } from "../lib/myOpinions.ts";

type SessionState =
  | { status: "loading" }
  | { status: "notFound" }
  | { status: "error"; message: string }
  | { status: "ready"; session: PublicSession };

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; list: OpinionList };

function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : "読み込みに失敗しました。";
}

export function ParticipantPage({ sessionId }: { sessionId: string }) {
  const [sessionState, setSessionState] = useState<SessionState>({ status: "loading" });
  const [listState, setListState] = useState<ListState>({ status: "loading" });
  // 自分の投稿の鍵。このブラウザにだけある
  const [mine, setMine] = useState<Record<string, string>>(() => loadMyOpinions());
  const [mode, setMode] = useState<ViewMode>("list");

  const loadSession = useCallback(async () => {
    setSessionState({ status: "loading" });
    try {
      setSessionState({ status: "ready", session: await getSession(sessionId) });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setSessionState({ status: "notFound" });
      else setSessionState({ status: "error", message: errorMessage(e) });
    }
  }, [sessionId]);

  const loadList = useCallback(async () => {
    try {
      setListState({ status: "ready", list: await listOpinions(sessionId) });
    } catch (e) {
      setListState({ status: "error", message: errorMessage(e) });
    }
  }, [sessionId]);

  useEffect(() => {
    void loadSession();
    void loadList();
  }, [loadSession, loadList]);

  function handleSubmitted(_result: OpinionResult) {
    setMine(loadMyOpinions());
    void loadList();
  }

  function handleDeleted(id: string) {
    forgetMyOpinion(id);
    setMine(loadMyOpinions());
    void loadList();
  }

  if (sessionState.status === "loading") {
    return (
      <main className="container py-4" style={{ maxWidth: 640 }}>
        <p role="status">読み込んでいます…</p>
      </main>
    );
  }
  if (sessionState.status === "notFound") {
    return (
      <main className="container py-4" style={{ maxWidth: 640 }}>
        <h1 className="h4">ページが見つかりません</h1>
        <p>URLが正しいか、運営者にご確認ください。まだ公開されていない可能性もあります。</p>
      </main>
    );
  }
  if (sessionState.status === "error") {
    return (
      <main className="container py-4" style={{ maxWidth: 640 }}>
        <div className="alert alert-danger" role="alert">
          {sessionState.message}
        </div>
        <button type="button" className="btn btn-outline-primary" onClick={() => void loadSession()}>
          もう一度読み込む
        </button>
      </main>
    );
  }

  const { session } = sessionState;
  return (
    <main className="container py-4" style={{ maxWidth: 640 }}>
      <header className="mb-4">
        <p className="text-body-secondary small mb-1">{session.eventName}</p>
        <h1 className="h4">{session.title}</h1>
        <p className="lead mb-0">{session.prompt}</p>
      </header>

      <section className="mb-4" aria-label="投稿について">
        <div className="card bg-body-tertiary">
          <div className="card-body small">
            <p className="mb-1">
              <strong>投稿について</strong>
            </p>
            <ul className="mb-0 ps-3">
              <li>名前の入力は不要です。投稿は匿名で扱われます。</li>
              <li>
                {session.showOpinions
                  ? "投稿は、このページを開いている参加者と運営者に表示されます。"
                  : "投稿は、運営者にだけ表示されます。"}
              </li>
              <li>
                運営者が、AIを使って意見を分析することがあります。そのために、外部のAIサービスへ送信される場合があります。
                AIの結果は参考情報であり、運営者が確認します。
              </li>
              <li>自分の投稿は、投稿したこのブラウザから、編集・削除できます。</li>
              <li>個人が特定される情報は書かないでください。</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mb-4" aria-label="投稿する">
        {session.acceptingOpinions ? (
          <OpinionForm sessionId={sessionId} onSubmitted={handleSubmitted} />
        ) : (
          <div className="alert alert-secondary mb-0" role="status">
            現在、投稿を受け付けていません。
          </div>
        )}
      </section>

      {session.showOpinions && (
        <section aria-label="投稿された意見">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h2 className="h5 mb-0">投稿された意見</h2>
            <div className="d-flex gap-2">
              <ViewToggle mode={mode} onChange={setMode} />
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void loadList()}>
                更新
              </button>
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
                  onChanged={() => void loadList()}
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
                      onChanged={() => void loadList()}
                    />
                  }
                />
                {mine[o.id] && (
                  <MyOpinionActions
                    opinion={o}
                    editKey={mine[o.id]!}
                    canEdit={session.acceptingOpinions}
                    onEdited={() => void loadList()}
                    onDeleted={handleDeleted}
                  />
                )}
              </div>
            ))}
        </section>
      )}
    </main>
  );
}
