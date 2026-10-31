import { useState } from "react";
import type { AdminApi } from "../../api/admin.ts";
import type { EventRecord, SessionRecord } from "../../api/types.ts";
import { AdminShell } from "../../components/admin/AdminShell.tsx";
import { EVENT_STATUS_LABELS, SESSION_STATUS_LABELS } from "../../lib/labels.ts";
import { withBase } from "../../lib/paths.ts";
import { useLoad } from "../../lib/useLoad.ts";
import { useMe } from "../../lib/useMe.ts";

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
        <a className="btn btn-sm btn-outline-primary" href={`${eventPath}/sessions/new`}>
          テーマを追加
        </a>
      </div>
      <ThemeRadioGroup event={state.data.event} sessions={state.data.sessions} api={api} describeError={describeError} onChanged={reload} />
      {state.data.sessions.length === 0 && <p className="text-body-secondary">まだテーマがありません。</p>}
      {state.data.sessions.map((session) => (
        <div key={session.id} className="mb-2">
        <a
          href={withBase(`/admin/events/${encodeURIComponent(eventId)}/sessions/${encodeURIComponent(session.id)}`)}
          className="card text-decoration-none"
        >
          <div className="card-body py-2 d-flex justify-content-between align-items-center">
            <span className="text-body">
              {session.title}
              {isOpenSession(state.data.event, state.data.sessions, session) && <span className="badge text-bg-primary ms-2">開いている</span>}
            </span>
            <span className={`badge ${session.status === "draft" ? "text-bg-warning" : "text-bg-secondary"}`}>
              {SESSION_STATUS_LABELS[session.status]}
            </span>
          </div>
        </a>
        {session.status === "draft" && (
          <p className="small text-warning-emphasis mb-1">参加者には見えません。テーマのページで「公開中」にすると見えます。</p>
        )}
        </div>
      ))}
      <EventMenu api={api} event={state.data.event} />
    </>
  );
}

/** いま開いているテーマか。選ばれていなければ、公開中のテーマすべてが開いている */
export function isOpenSession(event: EventRecord, sessions: SessionRecord[], session: SessionRecord): boolean {
  if (session.status !== "active") return false;
  const selected = selectedOpenIds(event);
  return selected === undefined ? sessions.some((s) => s.id === session.id) : selected.includes(session.id);
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
function EventMenu({ api, event }: { api: AdminApi; event: EventRecord }) {
  const me = useMe(api);
  const base = withBase(`/admin/events/${encodeURIComponent(event.id)}`);
  const items: { href: string; label: string; note: string; external?: boolean; ownerOnly?: boolean }[] = [
    { href: `${base}/edit`, label: "編集", note: "名前、説明、状態" },
    { href: `${base}/invite`, label: "招待URLとQR", note: "参加者に配るURL" },
    { href: `${base}/proposals`, label: "議題の提案", note: "参加者の提案を、承認・却下する" },
    { href: `${base}/notes`, label: "全テーマの記録", note: "結論と次の行動を、まとめて見る" },
    { href: `${base}/usage`, label: "AIの利用状況", note: "今日の使用量と上限" },
    { href: `${base}/operators`, label: "運営者のリンク", note: "このイベントだけを操作できるリンク", ownerOnly: true },
    { href: withBase(`/e/${encodeURIComponent(event.id)}`), label: "参加者の画面を見る", note: "参加者に見える画面を、新しいタブで開く", external: true },
  ];
  return (
    <nav aria-label="このイベントの操作" className="mt-4">
      <h2 className="h6">このイベントの操作</h2>
      <div className="list-group">
        {items
          .filter((item) => !(item.ownerOnly && me?.role === "operator"))
          .map((item) => (
            <a
              key={item.href}
              className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
              href={item.href}
              {...(item.external ? { target: "_blank", rel: "noreferrer" } : {})}
            >
              <span>
                {item.label}
                <span className="d-block small text-body-secondary">{item.note}</span>
              </span>
              <span aria-hidden="true">›</span>
            </a>
          ))}
      </div>
    </nav>
  );
}

const NONE = "__none__";

/** 投稿を受け付けるテーマ。公開中のテーマのどれか1つか、「すべて閉じる」を、ラジオボタンで選ぶ */
function ThemeRadioGroup({
  event,
  sessions,
  api,
  describeError,
  onChanged,
}: {
  event: EventRecord;
  sessions: SessionRecord[];
  api: AdminApi;
  describeError: (e: unknown) => string;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = selectedOpenIds(event);
  const publishedThemes = sessions.filter((s) => s.status !== "draft");
  // 1つだけ開いているとき、そのテーマ。なにも開いていなければ「すべて閉じる」。それ以外(未選択、複数)は、どれも選ばれていない
  const value = selected === undefined ? null : selected.length === 0 ? NONE : selected.length === 1 ? selected[0]! : null;

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

  if (publishedThemes.length === 0) {
    return <p className="small text-body-secondary mb-2">公開中のテーマがありません。テーマのページで「公開中」にすると、ここで選べます。</p>;
  }

  return (
    <fieldset className="mb-3" disabled={busy}>
      <legend className="fs-6 fw-bold">投稿を受け付けるテーマ</legend>
      <p className="small text-body-secondary mb-2">
        {selected === undefined
          ? "いまは、公開中のテーマすべてに投稿できます。1つを選ぶと、そのテーマだけに投稿できます。"
          : selected.length > 1
            ? "いまは、複数のテーマが開いています。1つを選ぶと、そのテーマだけになります。"
            : "選んだテーマにだけ投稿できます。ほかのテーマは、見るだけになります。"}
      </p>
      {publishedThemes.map((s) => (
        <div className="form-check" key={s.id}>
          <input
            className="form-check-input"
            type="radio"
            name="open-theme"
            id={`open-theme-${s.id}`}
            checked={value === s.id}
            disabled={s.status === "closed"}
            onChange={() => void choose(s.id)}
          />
          <label className="form-check-label" htmlFor={`open-theme-${s.id}`}>
            {s.title}
            {s.status === "closed" && <span className="ms-2 text-body-secondary">（終了したテーマ）</span>}
          </label>
        </div>
      ))}
      <div className="form-check">
        <input
          className="form-check-input"
          type="radio"
          name="open-theme"
          id="open-theme-none"
          checked={value === NONE}
          onChange={() => void choose(NONE)}
        />
        <label className="form-check-label" htmlFor="open-theme-none">
          すべて閉じる（どのテーマにも投稿できません）
        </label>
      </div>
      <p className="small text-body-secondary mt-1 mb-0">
        公開中のイベントは、トップページから、誰でも参加できます。不審な投稿が続くときは、「すべて閉じる」で、投稿を止められます（意見を見ることはできます）。
      </p>
      {error && (
        <p className="text-danger small mt-1 mb-0" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

