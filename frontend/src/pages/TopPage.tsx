import { listPublicEvents } from "../api/client.ts";
import { StickyBoard } from "../components/StickyBoard.tsx";
import { SAMPLE_GROUPS, SAMPLE_THEME } from "../lib/sampleBoard.ts";
import { withBase } from "../lib/paths.ts";
import { VersionInfo } from "../components/VersionInfo.tsx";
import { useLoad } from "../lib/useLoad.ts";

export function TopPage() {
  return (
    <main className="container py-4" style={{ maxWidth: 640 }}>
      <h1 className="h3">Opinion Map</h1>
      <p className="lead">意見の違いを、対話のきっかけに。</p>
      <p>
        オンラインのイベントで、参加者の意見を集め、共通点や違いを見つけるためのアプリです。
        ログインや名前の入力は必要ありません。
      </p>
      <PublicEvents />
      <section aria-label="サンプル" className="mb-4">
        <h2 className="h5">こんなふうに使います</h2>
        <p className="small text-body-secondary mb-2">
          <span className="badge text-bg-warning me-1">サンプル</span>
          「{SAMPLE_THEME}」の例です。架空の意見で、操作しても、何も保存されません。
        </p>
        <StickyBoard groups={SAMPLE_GROUPS} />
      </section>
      <p className="small">
        <a href={withBase("/admin")} className="text-body-secondary">
          管理者ログイン
        </a>
      </p>
      <VersionInfo />
    </main>
  );
}

/** 招待がなくても、公開中のイベントを選んで参加できる。読めないとき(通信の失敗など)は、何も出さない */
function PublicEvents() {
  const { state } = useLoad(() => listPublicEvents(), () => "", []);
  if (state.status === "loading") return <p role="status" className="text-body-secondary">読み込んでいます…</p>;
  if (state.status === "error") {
    return <div className="alert alert-info">意見を投稿するには、運営者から共有されたURLを開いてください。</div>;
  }
  return (
    <section aria-label="公開中のイベント" className="mb-4">
      <h2 className="h5">公開中のイベント</h2>
      {state.data.length === 0 ? (
        <div className="alert alert-info">
          いま公開中のイベントはありません。運営者から共有されたURLがあれば、それを開いてください。
        </div>
      ) : (
        <>
          <p className="small text-body-secondary">選ぶと、意見を見たり、投稿したりできます。</p>
          <div className="list-group">
            {state.data.map((event) => (
              <a
                key={event.id}
                className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                href={withBase(`/e/${encodeURIComponent(event.id)}`)}
              >
                <span className="text-break">
                  {event.name}
                  {event.description && <span className="d-block small text-body-secondary">{event.description}</span>}
                </span>
                <span aria-hidden="true">›</span>
              </a>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
