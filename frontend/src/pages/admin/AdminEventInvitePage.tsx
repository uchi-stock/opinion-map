import { AdminShell } from "../../components/admin/AdminShell.tsx";
import { CopyField } from "../../components/admin/CopyField.tsx";
import { QrCode } from "../../components/admin/QrCode.tsx";
import { eventInviteUrl } from "../../lib/labels.ts";
import { withBase } from "../../lib/paths.ts";

export function AdminEventInvitePage({ eventId }: { eventId: string }) {
  return (
    <AdminShell title="参加者の招待URL" back={{ href: withBase(`/admin/events/${encodeURIComponent(eventId)}`), label: "イベント" }}>
      {() => <InviteSection eventId={eventId} />}
    </AdminShell>
  );
}

/** 参加者に配る招待URL。イベントごとに1つで、テーマは運営者が切り替える */
function InviteSection({ eventId }: { eventId: string }) {
  const url = eventInviteUrl(eventId);
  return (
    <section aria-label="参加者の招待URL">
      <p className="small text-body-secondary">
        イベントごとに1つです。参加者はこのURLから、いまのテーマに投稿でき、すべてのテーマを見られます。
      </p>
      <CopyField label="招待URL" value={url} />
      <div className="mb-3">
        <QrCode value={url} label="招待URLのQRコード" />
      </div>
    </section>
  );
}
