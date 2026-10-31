import { useEffect, useState } from "react";
import { ApiError, getPublicEvent } from "../api/client.ts";
import type { PublicEvent } from "../api/types.ts";
import { PublishedNotes } from "../components/PublishedNotes.tsx";
import { ProposalSection } from "../components/ProposalSection.tsx";
import { ParticipantPage } from "./ParticipantPage.tsx";

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

  async function load() {
    try {
      setState({ status: "ready", event: await getPublicEvent(eventId) });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setState({ status: "notFound" });
      else setState({ status: "error", message: e instanceof ApiError ? e.message : "読み込みに失敗しました。" });
    }
  }

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
      </main>
    );
  }
  if (state.status === "error") {
    return (
      <main className="container py-4" style={{ maxWidth: 640 }}>
        <div className="alert alert-danger" role="alert">
          {state.message}
        </div>
        <button type="button" className="btn btn-outline-primary" onClick={() => void load()}>
          もう一度読み込む
        </button>
      </main>
    );
  }

  const { event } = state;
  if (event.sessions.length === 0) {
    return (
      <main className="container py-4" style={{ maxWidth: 640 }}>
        <p className="text-body-secondary small mb-1">{event.name}</p>
        <p>まだテーマが公開されていません。運営者からの案内をお待ちください。</p>
        <button type="button" className="btn btn-outline-secondary" onClick={() => void load()}>
          更新
        </button>
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
      <nav aria-label="テーマの切り替え" className="mb-3">
        <div className="d-flex flex-wrap gap-2 align-items-center">
          {event.sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`btn btn-sm ${s.id === selected.id ? "btn-primary" : "btn-outline-primary"}`}
              aria-pressed={s.id === selected.id}
              onClick={() => setPicked(s.id)}
            >
              {s.title}
              {s.isOpen ? (
                <span className="badge text-bg-light ms-1">投稿中</span>
              ) : (
                <span className="badge text-bg-secondary ms-1">閲覧のみ</span>
              )}
              {s.opinionCount !== undefined && <span className="ms-1 small">（{s.opinionCount}件）</span>}
            </button>
          ))}
          <button type="button" className="btn btn-sm btn-outline-secondary ms-auto" onClick={() => void load()}>
            テーマを更新
          </button>
        </div>
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
      <ParticipantPage key={selected.id} sessionId={selected.id} embedded />
      <PublishedNotes eventId={event.id} />
    </main>
  );
}
