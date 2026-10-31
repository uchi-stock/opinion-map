import { useState } from "react";
import type { AdminApi } from "../../api/admin.ts";
import type { EventRecord, SessionRecord } from "../../api/types.ts";
import { AdminShell } from "../../components/admin/AdminShell.tsx";
import { EVENT_STATUS_LABELS, SESSION_STATUS_LABELS } from "../../lib/labels.ts";
import { withBase } from "../../lib/paths.ts";
import { useLoad } from "../../lib/useLoad.ts";

export function AdminEventPage({ eventId }: { eventId: string }) {
  return (
    <AdminShell title="イベント" back={{ href: withBase("/admin"), label: "イベント一覧" }}>
      {({ api, describeError }) => <EventContent api={api} describeError={describeError} eventId={eventId} />}
    </AdminShell>
  );
}

function EventContent({
  api,
  describeError,
  eventId,
}: {
  api: AdminApi;
  describeError: (e: unknown) => string;
  eventId: string;
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

  const eventPath = withBase(`/admin/events/${encodeURIComponent(eventId)}`);
  if (state.status === "loading") return <p role="status">読み込んでいます…</p>;
  if (state.status === "error")
    return (
      <div className="alert alert-danger" role="alert">
        {state.message}
      </div>
    );
  return (
    <>
      <EventSummary event={state.data.event} />
      <div className="d-flex justify-content-between align-items-center mt-3 mb-2">
        <h2 className="h6 mb-0">テーマ</h2>
        <a className="btn icon-btn btn-sm btn-outline-primary" href={`${eventPath}/sessions/new`} aria-label="テーマを追加" title="テーマを追加">➕</a>
      </div>
      <ThemeList event={state.data.event} sessions={state.data.sessions} eventId={eventId} api={api} describeError={describeError} onChanged={reload} />
      <EventMenu event={state.data.event} />
    </>
  );
}

function selectedOpenIds(event: EventRecord): string[] | undefined {
  if (event.openSessionIds !== undefined) return event.openSessionIds;
  if (event.currentSessionId !== undefined) return [event.currentSessionId];
  return undefined;
}

/** イベントの名前、状態、説明(固定の表示)。編集と招待URLは、別の画面へのリンクにする */
function EventSummary({ event }: { event: EventRecord }) {
  return (
    <section aria-label="イベントの情報">
      <div className="d-flex justify-content-between align-items-start gap-2">
        <h2 className="h5 mb-1 text-break">{event.name}</h2>
        <span className="badge text-bg-secondary flex-shrink-0">{EVENT_STATUS_LABELS[event.status]}</span>
      </div>
      {event.description ? (
        <p className="mb-2" style={{ whiteSpace: "pre-wrap" }}>
          {event.description}
        </p>
      ) : (
        <p className="mb-2 text-body-secondary">説明はありません。</p>
      )}
      {event.status !== "active" && (
        <p className="small text-body-secondary mb-2">参加者に見えるのは、「公開中」のイベントだけです。編集の画面で、状態を切り替えます。</p>
      )}
    </section>
  );
}

/** このイベントでできることの入口。重い操作は、それぞれ別の画面で行う */
function EventMenu({ event }: { event: EventRecord }) {
  const base = withBase(`/admin/events/${encodeURIComponent(event.id)}`);
  /** short は、タイルに見せる短い名前。label は、読み上げ用の名前 */
  const items: { href: string; emoji: string; label: string; short: string; external?: boolean }[] = [
    { href: `${base}/edit`, emoji: "✏️", label: "編集", short: "編集" },
    { href: `${base}/invite`, emoji: "🔗", label: "招待URLとQR", short: "招待URL" },
    { href: `${base}/proposals`, emoji: "💬", label: "議題の提案", short: "議題" },
    { href: `${base}/notes`, emoji: "📝", label: "全テーマの記録", short: "記録" },
    { href: `${base}/usage`, emoji: "📊", label: "AIの利用状況", short: "AI利用" },
    { href: withBase(`/e/${encodeURIComponent(event.id)}`), emoji: "👀", label: "参加者の画面を見る", short: "参加者画面", external: true },
  ];
  return (
    <nav aria-label="このイベントの操作" className="mt-4">
      <div className="row row-cols-3 g-2">
        {items
          .map((item) => (
            <div className="col" key={item.href}>
              <a
                className="menu-tile btn btn-outline-secondary h-100"
                href={item.href}
                aria-label={item.label}
                title={item.label}
                {...(item.external ? { target: "_blank", rel: "noreferrer" } : {})}
              >
                <span className="menu-emoji" aria-hidden="true">
                  {item.emoji}
                </span>
                <span className="menu-label" aria-hidden="true">
                  {item.short}
                </span>
              </a>
            </div>
          ))}
      </div>
    </nav>
  );
}

const NONE = "__none__";

/**
 * テーマの一覧。1行に、ラジオボタン(投稿を受け付けるテーマ)、テーマ名(タップで、テーマのページへ)、状態を並べる。
 * 選べるのは、公開中のテーマのどれか1つか、「すべて閉じる」。下書きには、ラジオを出さない。
 */
function ThemeList({
  event,
  sessions,
  eventId,
  api,
  describeError,
  onChanged,
}: {
  event: EventRecord;
  sessions: SessionRecord[];
  eventId: string;
  api: AdminApi;
  describeError: (e: unknown) => string;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = selectedOpenIds(event);
  // 1つだけ開いているとき、そのテーマ。なにも開いていなければ「すべて閉じる」。それ以外(未選択、複数)は、どれも選ばれていない
  const value = selected === undefined ? null : selected.length === 0 ? NONE : selected.length === 1 ? selected[0]! : null;
  const hasDraft = sessions.some((s) => s.status === "draft");
  const hasPublished = sessions.some((s) => s.status !== "draft");

  async function choose(next: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateEvent(event.id, { openSessionIds: next === NONE ? [] : [next] });
      await onChanged();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  if (sessions.length === 0) return <p className="text-body-secondary">まだテーマがありません。</p>;

  return (
    <fieldset disabled={busy} className="mb-3">
      <legend className="visually-hidden">投稿を受け付けるテーマ</legend>
      <div className="list-group">
        {sessions.map((s) => (
          <div className="list-group-item d-flex align-items-center gap-2" key={s.id}>
            {s.status === "draft" ? (
              <span className="flex-shrink-0" style={{ width: "1.25em" }} aria-hidden="true" />
            ) : (
              <input
                className="form-check-input mt-0 flex-shrink-0"
                type="radio"
                name="open-theme"
                aria-label={s.title}
                title="ここに投稿を受け付ける"
                checked={value === s.id}
                disabled={s.status === "closed"}
                onChange={() => void choose(s.id)}
              />
            )}
            <a
              className="flex-grow-1 text-body text-decoration-none text-break"
              href={withBase(`/admin/events/${encodeURIComponent(eventId)}/sessions/${encodeURIComponent(s.id)}`)}
            >
              {s.title}
            </a>
            <span className={`badge flex-shrink-0 ${s.status === "draft" ? "text-bg-warning" : "text-bg-secondary"}`}>
              {SESSION_STATUS_LABELS[s.status]}
            </span>
          </div>
        ))}
        {hasPublished && (
          <label className="list-group-item d-flex align-items-center gap-2 mb-0">
            <input
              className="form-check-input mt-0 flex-shrink-0"
              type="radio"
              name="open-theme"
              aria-label="すべて閉じる（どのテーマにも投稿できません）"
              checked={value === NONE}
              onChange={() => void choose(NONE)}
            />
            <span aria-hidden="true">🔒 すべて閉じる</span>
          </label>
        )}
      </div>
      <p className="small text-body-secondary mt-2 mb-0">
        {selected === undefined
          ? "いまは、公開中のテーマすべてに投稿できます。ラジオで選ぶと、そのテーマだけになります。"
          : selected.length > 1
            ? "いまは、複数のテーマが開いています。ラジオで1つを選ぶと、そのテーマだけになります。"
            : "選んだテーマにだけ投稿できます。不審な投稿が続くときは、「すべて閉じる」で止められます。"}
        {hasDraft && " 下書きは、参加者に見えません。テーマのページの設定で「公開中」にします。"}
      </p>
      {error && (
        <p className="text-danger small mt-1 mb-0" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
