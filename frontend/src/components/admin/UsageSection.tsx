import type { AdminApi } from "../../api/admin.ts";
import { useLoad } from "../../lib/useLoad.ts";

const timeFormat = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** AIの利用(分析・案の生成)の、今日の使用量と上限。上限は費用の歯止めで、日本時間の0時に戻る */
export function UsageSection({ api, eventId, describeError }: { api: AdminApi; eventId: string; describeError: (e: unknown) => string }) {
  const { state } = useLoad(() => api.getUsage(eventId), describeError, [api, eventId]);
  if (state.status !== "ready") return null;
  const u = state.data;
  const row = (label: string, v: { used: number; limit: number }) => (
    <li className="d-flex justify-content-between">
      <span>{label}</span>
      <span className={v.used >= v.limit ? "text-danger fw-bold" : ""}>
        {v.used} / {v.limit}回{v.used >= v.limit && "（上限）"}
      </span>
    </li>
  );
  return (
    <section aria-label="AIの利用状況">
      <hr />
      <h2 className="h6">AIの利用状況（今日）</h2>
      <p className="small text-body-secondary">
        分析と案の生成は、実行のたびに費用がかかります。誤操作や使いすぎを防ぐため、1日の上限があります。上限は、{timeFormat.format(new Date(u.resetsAt))}（日本時間）に戻ります。
      </p>
      <ul className="list-unstyled">
        {row("分析", u.analysis)}
        {row("案の生成", u.insight)}
      </ul>
    </section>
  );
}
