import { withBase } from "../lib/paths.ts";
import { VersionInfo } from "../components/VersionInfo.tsx";

export function TopPage() {
  return (
    <main className="container py-4" style={{ maxWidth: 640 }}>
      <h1 className="h3">Opinion Map</h1>
      <p className="lead">意見の違いを、対話のきっかけに。</p>
      <p>
        オンラインのイベントで、参加者の意見を集め、共通点や違いを見つけるためのアプリです。
        ログインや名前の入力は必要ありません。
      </p>
      <div className="alert alert-info">
        意見を投稿するには、運営者から共有されたURLを開いてください。
      </div>
      <p className="small">
        <a href={withBase("/admin")} className="text-body-secondary">
          管理者ログイン
        </a>
      </p>
      <VersionInfo />
    </main>
  );
}
