import { useCallback, useEffect, useState } from "react";
import { ApiError, getPublicSummary, getSession, listOpinions, sendPresence } from "../api/client.ts";
import type { OpinionResult, PublicSession, PublicSummaryResponse } from "../api/types.ts";
import type { ContentView } from "../components/ViewTabs.tsx";
import type { ViewMode } from "../components/StickyBoard.tsx";
import { getVoterId } from "../lib/reactions.ts";
import { useVisiblePolling } from "../lib/useVisiblePolling.ts";
import { forgetMyOpinion, loadMyOpinions } from "../lib/myOpinions.ts";
import { withBase } from "../lib/paths.ts";
import { ComposeScreen } from "../components/participant/ComposeScreen.tsx";
import { ReadingScreen } from "../components/participant/ReadingScreen.tsx";
import type { ListState } from "../components/participant/types.ts";
import { TimerBadge } from "../components/TimerBadge.tsx";
import { useHashFlag } from "../lib/useHashFlag.ts";

/** 見ていることを知らせる間隔。サーバーが数える時間(90秒)より、短くする */
const PRESENCE_INTERVAL_MS = 30_000;

type SessionState =
  | { status: "loading" }
  | { status: "notFound" }
  | { status: "error"; message: string }
  | { status: "ready"; session: PublicSession };

function MainShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="container py-4" style={{ maxWidth: 640 }}>
      {children}
    </main>
  );
}

function EmbeddedShell({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : "読み込みに失敗しました。";
}

/**
 * テーマの画面。embedded のときは、イベントの招待URLの画面の中に置かれる
 * (外側の main と、イベント名は、親が出す)。
 */
export function ParticipantPage({ sessionId, embedded = false }: { sessionId: string; embedded?: boolean }) {
  const Shell = embedded ? EmbeddedShell : MainShell;
  const [sessionState, setSessionState] = useState<SessionState>({ status: "loading" });
  const [listState, setListState] = useState<ListState>({ status: "loading" });
  // 自分の投稿の鍵。このブラウザにだけある
  const [mine, setMine] = useState<Record<string, string>>(() => loadMyOpinions());
  // ボードが基本。一覧は、自分の投稿の編集・削除に使う
  const [mode, setMode] = useState<ViewMode>("board");
  // 「投稿する」のリンク(#post)で、従来の投稿画面を開く
  const [composing, setComposing] = useHashFlag("post");
  const [posted, setPosted] = useState(false);
  // 運営者が公開した要約があるときだけ、「要約」の見方を出す
  const [summary, setSummary] = useState<PublicSummaryResponse | null>(null);
  const [view, setView] = useState<ContentView>("raw");

  const loadSession = useCallback(async () => {
    setSessionState({ status: "loading" });
    try {
      setSessionState({ status: "ready", session: await getSession(sessionId) });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setSessionState({ status: "notFound" });
      else setSessionState({ status: "error", message: errorMessage(e) });
    }
  }, [sessionId]);

  // 時間が来たとき。画面を「読み込み中」にせず、受付の状態だけをサーバーから取り直す
  const refreshSession = useCallback(async () => {
    try {
      setSessionState({ status: "ready", session: await getSession(sessionId) });
    } catch {
      // 失敗しても、いまの表示を保つ
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
    // 要約が読めなくても、原文の閲覧と投稿は続けられる
    getPublicSummary(sessionId).then(setSummary, () => setSummary(null));
  }, [loadSession, loadList, sessionId]);

  // 開いた直後にも、1回知らせる
  useEffect(() => {
    sendPresence(sessionId, getVoterId()).catch(() => undefined);
  }, [sessionId]);

  // 見ている間だけ、30秒ごとに知らせる(端末の数の目安に使う。個人は特定しない)
  useVisiblePolling(() => {
    sendPresence(sessionId, getVoterId()).catch(() => undefined);
  }, PRESENCE_INTERVAL_MS);

  function handleSubmitted(_result: OpinionResult) {
    setMine(loadMyOpinions());
    void loadList();
    // 投稿したら、ボードに戻る。投稿できたことは、ボードに出す
    setPosted(true);
    setComposing(false);
  }

  function handleDeleted(id: string) {
    forgetMyOpinion(id);
    setMine(loadMyOpinions());
    void loadList();
  }

  if (sessionState.status === "loading") {
    return (
      <Shell>
        <p role="status">読み込んでいます…</p>
      </Shell>
    );
  }
  if (sessionState.status === "notFound") {
    return (
      <Shell>
        <h1 className="h4">ページが見つかりません</h1>
        <p>URLが正しいか、運営者にご確認ください。まだ公開されていない可能性もあります。</p>
        <p>
          <a href={withBase("/")}>トップページへ</a>
        </p>
      </Shell>
    );
  }
  if (sessionState.status === "error") {
    return (
      <Shell>
        <div className="alert alert-danger" role="alert">
          {sessionState.message}
        </div>
        <button type="button" className="btn icon-btn btn-outline-primary" onClick={() => void loadSession()} aria-label="もう一度読み込む" title="もう一度読み込む">🔄</button>
      </Shell>
    );
  }

  const { session } = sessionState;
  return (
    <Shell>
      <header className="mb-4">
        {!embedded && <p className="text-body-secondary small mb-1">{session.eventName}</p>}
        {/* 旧URL(/s/<ID>)から開いたときも、イベントのほかのテーマへ行けるようにする */}
        {!embedded && (
          <p className="small mb-1">
            <a href={withBase(`/e/${encodeURIComponent(session.eventId)}`)}>このイベントのほかのテーマを見る</a>
          </p>
        )}
        <h1 className="h4">{session.title}</h1>
        <p className="lead mb-0">{session.prompt}</p>
        {session.status === "active" && session.deadlineAt && session.serverNow && (
          <p className="mt-2 mb-0">
            <TimerBadge deadlineAt={session.deadlineAt} serverNow={session.serverNow} onExpire={() => void refreshSession()} />
          </p>
        )}
      </header>

      {composing ? (
        <ComposeScreen session={session} sessionId={sessionId} onBack={() => setComposing(false)} onSubmitted={handleSubmitted} />
      ) : (
        <ReadingScreen
          session={session}
          summary={summary}
          view={view}
          setView={setView}
          listState={listState}
          mode={mode}
          setMode={setMode}
          posted={posted}
          onPostLink={() => setPosted(false)}
          mine={mine}
          reload={() => void loadList()}
          onDeleted={handleDeleted}
        />
      )}
    </Shell>
  );
}
