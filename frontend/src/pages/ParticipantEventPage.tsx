import { useEffect, useState } from "react";
import { ApiError, getPublicEvent } from "../api/client.ts";
import type { PublicEvent } from "../api/types.ts";
import { useVisiblePolling } from "../lib/useVisiblePolling.ts";
import { PublishedNotes } from "../components/PublishedNotes.tsx";
import { ProposalSection } from "../components/ProposalSection.tsx";
import { withBase } from "../lib/paths.ts";
import { useHashFlag } from "../lib/useHashFlag.ts";
import { ParticipantPage } from "./ParticipantPage.tsx";

/** テーマの開閉に追従する間隔。DynamoDB の読み取りの費用を抑えるため、長めにする */
export const REFRESH_INTERVAL_MS = 30_000;

type State =
  | { status: "loading" }
  | { status: "notFound" }
  | { status: "error"; message: string }
  | { status: "ready"; event: PublicEvent };

/**
 * イベントの招待URL(イベントごとに1つ)から開く画面。
 * 運営者が選んだ「いまのテーマ」に投稿できる。参加者は、すべてのテーマを選んで見られる。
 */
export function ParticipantEventPage({ eventId }: { eventId: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  // 参加者が選んだテーマ。未選択なら、開いているテーマの最初(なければ最初のテーマ)
  const [picked, setPicked] = useState<string | null>(null);
  // 投稿画面(#post)のときは、投稿に集中できるよう、ほかの欄を出さない
  const [composing] = useHashFlag("post");

  async function load() {
    try {
      setState({ status: "ready", event: await getPublicEvent(eventId) });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setState({ status: "notFound" });
      else setState({ status: "error", message: e instanceof ApiError ? e.message : "読み込みに失敗しました。" });
    }
  }

  // 運営者がテーマを開閉したら、数十秒以内に追従する。失敗しても、いまの表示は変えない
  useVisiblePolling(() => {
    getPublicEvent(eventId)
      .then((event) => setState((prev) => (prev.status === "ready" ? { status: "ready", event } : prev)))
      .catch(() => undefined);
  }, REFRESH_INTERVAL_MS);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  if (state.status === "loading") {
    return (
      <main className="container py-4" style={{ maxWidth: 640 }}>
        <p role="status">読み込んでいます…</p>
      </main>
    );
  }
  if (state.status === "notFound") {
    return (
      <main className="container py-4" style={{ maxWidth: 640 }}>
        <h1 className="h4">ページが見つかりません</h1>
        <p>URLが正しいか、運営者にご確認ください。まだ公開されていない可能性もあります。</p>
        <p>
          <a href={withBase("/")}>トップページへ</a>
        </p>
      </main>
    );
  }
  if (state.status === "error") {
    return (
      <main className="container py-4" style={{ maxWidth: 640 }}>
        <div className="alert alert-danger" role="alert">
          {state.message}
        </div>
        <button type="button" className="btn icon-btn btn-outline-primary" onClick={() => void load()} aria-label="もう一度読み込む" title="もう一度読み込む">🔄</button>
      </main>
    );
  }

  const { event } = state;
  if (event.status === "draft") {
    return (
      <main className="container py-4" style={{ maxWidth: 640 }}>
        <div className="alert alert-secondary" role="status">
          <p className="fw-bold mb-1">このイベントは、まだ始まっていません</p>
          <p className="mb-0">開始をお待ちください。始まると、この画面が自動で切り替わります。</p>
        </div>
        <button type="button" className="btn icon-btn btn-outline-secondary" onClick={() => void load()} aria-label="更新" title="更新">🔄</button>
      </main>
    );
  }
  if (event.sessions.length === 0) {
    return (
      <main className="container py-4" style={{ maxWidth: 640 }}>
        <p className="text-body-secondary small mb-1">{event.name}</p>
        <div className="alert alert-secondary" role="status">
          <p className="fw-bold mb-1">テーマは、まだ公開されていません</p>
          <p className="mb-0">開始をお待ちください。公開されると、この画面が自動で切り替わります。</p>
        </div>
        <button type="button" className="btn icon-btn btn-outline-secondary" onClick={() => void load()} aria-label="更新" title="更新">🔄</button>
      </main>
    );
  }
  const selected =
    event.sessions.find((s) => s.id === picked) ??
    event.sessions.find((s) => s.isOpen) ??
    event.sessions[0]!;

  return (
    <main className="container py-4" style={{ maxWidth: 640 }}>
      <p className="text-body-secondary small mb-1">{event.name}</p>
      {!composing && (
        <>
      <nav aria-label="テーマの切り替え" className="mb-3">
        <div className="d-flex justify-content-between align-items-center mb-1">
          <h2 className="h6 mb-0">テーマ（{event.sessions.length}件）</h2>
          <button type="button" className="btn icon-btn btn-sm btn-outline-secondary" onClick={() => void load()} aria-label="テーマを更新" title="テーマを更新">🔄</button>
        </div>
        <ul className="list-group">
          {event.sessions.map((s) => (
            <li key={s.id} className="list-group-item p-0">
              <button
                type="button"
                className={`list-group-item list-group-item-action border-0 d-flex justify-content-between align-items-center gap-2 ${s.id === selected.id ? "active" : ""}`}
                aria-pressed={s.id === selected.id}
                onClick={() => {
                  if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
                  setPicked(s.id);
                }}
              >
                <span className="text-start">
                  {s.title}
                  {s.opinionCount !== undefined && <span className="ms-1 small">（{s.opinionCount}件）</span>}
                  {s.viewers !== undefined && (
                    <span className="ms-1 small" aria-label="見ている人の目安">
                      ・{s.viewers === "few" ? "見ている人は少数" : `見ている人は約${s.viewers}人`}
                    </span>
                  )}
                </span>
                {s.isOpen ? (
                  <span className="badge text-bg-light flex-shrink-0">投稿中</span>
                ) : (
                  <span className="badge text-bg-secondary flex-shrink-0">閲覧のみ</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {!selected.acceptingOpinions && (
          <p className="small text-body-secondary mt-2 mb-0">
            このテーマは、いま投稿を受け付けていません。意見を見ることはできます。
            {event.sessions.some((s) => s.isOpen) && "投稿できるテーマは、「投稿中」の印がついたものです。"}
          </p>
        )}
      </nav>
      <ProposalSection
        eventId={event.id}
        onOpenSession={(sessionId) => {
          setPicked(sessionId);
          void load();
        }}
      />
        </>
      )}
      <ParticipantPage key={selected.id} sessionId={selected.id} embedded />
      {!composing && <PublishedNotes eventId={event.id} />}
    </main>
  );
}
