import { withBase } from "../lib/paths.ts";
import { DEMO_ADMIN_TOKEN } from "./installDemoApi.ts";

interface Props {
  sampleSessionId: string | undefined;
  onReset: () => void;
}

/** デモ版であることと、データの扱いを、すべての画面の上に表示する */
export function DemoBanner({ sampleSessionId, onReset }: Props) {
  return (
    <aside className="alert alert-warning rounded-0 mb-0 small" role="note" aria-label="デモ版のお知らせ">
      <div className="container" style={{ maxWidth: 640 }}>
        <p className="mb-1">
          <strong>デモ版です。</strong>
          データは、このブラウザの中にだけ保存されます。他の人とは共有されません。
        </p>
        <p className="mb-2">運営者の画面のトークンは「{DEMO_ADMIN_TOKEN}」です（入力済みです）。</p>
        <div className="d-flex flex-wrap gap-2">
          <a className="btn icon-btn btn-sm btn-outline-dark" href={withBase("/admin")} aria-label="運営者の画面" title="運営者の画面">🛠️</a>
          {sampleSessionId && (
            <a className="btn icon-btn btn-sm btn-outline-dark" href={withBase(`/s/${encodeURIComponent(sampleSessionId)}`)} aria-label="参加者の画面（サンプル）" title="参加者の画面（サンプル）">👀</a>
          )}
          <button type="button" className="btn icon-btn btn-sm btn-outline-danger" onClick={onReset} aria-label="最初からやり直す" title="最初からやり直す">♻️</button>
        </div>
      </div>
    </aside>
  );
}
