import { useState, type FormEvent } from "react";
import type { AdminApi } from "../../api/admin.ts";
import { ApiError } from "../../api/client.ts";
import { useLoad } from "../../lib/useLoad.ts";

/**
 * 管理者(Googleログインを許可する人)の一覧。オーナーだけが追加・削除できる。
 * 運営者のトークンで開いたときは、権限がないので、何も表示しない。
 */
export function AdminListSection({ api, describeError }: { api: AdminApi; describeError: (e: unknown) => string }) {
  const { state, reload } = useLoad(() => api.listAdmins(), (e) => (e instanceof ApiError && e.status === 403 ? "forbidden" : describeError(e)), [api]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status === "loading") return null;
  if (state.status === "error" && state.message === "forbidden") return null;

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    await run(async () => {
      await api.addAdmin(email.trim());
      setEmail("");
    });
  }

  const admins = state.status === "ready" ? state.data : [];

  return (
    <section aria-label="管理者">
      <h2 className="h6">管理者</h2>
      <p className="small text-body-secondary">
        ここに載っているGoogleアカウントだけが、管理画面にログインできます。参加者は、ログインなしで投稿できます。
        削除すると、その人は次の操作から管理画面を使えなくなります。最後の1人は削除できません。
      </p>
      <form onSubmit={add} className="mb-3" aria-label="管理者の追加">
        <label htmlFor="admin-email" className="form-label">
          追加するGoogleアカウントのメールアドレス
        </label>
        <input id="admin-email" type="email" className="form-control mb-2" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" className="btn btn-outline-primary w-100" disabled={busy || !email.trim()}>
          管理者に追加する
        </button>
      </form>
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      <ul className="list-unstyled">
        {admins.map((a) => (
          <li key={a.email} className="d-flex justify-content-between align-items-center mb-2">
            <span className="text-break">{a.email}</span>
            <button
              type="button"
              className="btn btn-sm btn-outline-danger ms-2 flex-shrink-0"
              disabled={busy || admins.length <= 1}
              onClick={() => void run(() => api.removeAdmin(a.email))}
              aria-label={`${a.email}を管理者から外す`}
            >
              外す
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
