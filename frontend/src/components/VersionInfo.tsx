import formatBuildTime from "../formatBuildTime.js"; // symlink（dev-standards の共有ヘルパー）

/** 共有ヘルパーで整形する。日付として読めない値は「不明」にし、日本時間であることを添える */
function formatBuilt(iso: string): string {
  return Number.isNaN(new Date(iso).getTime()) ? "不明" : `${formatBuildTime(iso)}（日本時間）`;
}

/** トップページの必須表示: バージョンと更新日時 */
export function VersionInfo({ version = __APP_VERSION__, builtAt = __APP_BUILD_TIME__ }: { version?: string; builtAt?: string }) {
  return (
    <footer className="text-body-secondary small mt-5">
      <div>バージョン: {version}</div>
      <div>更新日時: {formatBuilt(builtAt)}</div>
    </footer>
  );
}
