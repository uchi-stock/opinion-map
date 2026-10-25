const timeFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatBuildTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "不明" : `${timeFormat.format(date)}（日本時間）`;
}

/** トップページの必須表示: バージョンと更新日時 */
export function VersionInfo({ version = __APP_VERSION__, builtAt = __BUILD_TIME__ }: { version?: string; builtAt?: string }) {
  return (
    <footer className="text-body-secondary small mt-5">
      <div>バージョン: {version}</div>
      <div>更新日時: {formatBuildTime(builtAt)}</div>
    </footer>
  );
}
