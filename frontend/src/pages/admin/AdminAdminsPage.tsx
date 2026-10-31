import type { AdminApi } from "../../api/admin.ts";
import { AdminListSection } from "../../components/admin/AdminListSection.tsx";
import { AdminShell } from "../../components/admin/AdminShell.tsx";
import { withBase } from "../../lib/paths.ts";
import { useMe } from "../../lib/useMe.ts";

/** 管理者(Googleログインを許可する人)の追加と削除。オーナーだけが使える */
export function AdminAdminsPage() {
  return (
    <AdminShell title="管理者" back={{ href: withBase("/admin"), label: "イベント一覧" }}>
      {({ api, describeError }) => <AdminsContent api={api} describeError={describeError} />}
    </AdminShell>
  );
}

function AdminsContent({ api, describeError }: { api: AdminApi; describeError: (e: unknown) => string }) {
  const me = useMe(api);
  if (me === undefined) return <p role="status">読み込んでいます…</p>;
  if (me?.role === "operator") return <p className="text-body-secondary">この画面は、オーナーだけが使えます。</p>;
  return <AdminListSection api={api} describeError={describeError} />;
}
