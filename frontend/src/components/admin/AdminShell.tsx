import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createAdminApi, type AdminApi } from "../../api/admin.ts";
import { ApiError } from "../../api/client.ts";
import { clearAdminToken, loadAdminToken, saveAdminToken } from "../../lib/adminToken.ts";

export interface AdminContext {
  api: AdminApi;
  /** エラーを、画面に出す文にする。トークンが誤っているときは、入力画面に戻す */
  describeError: (error: unknown) => string;
}

interface Props {
  title: string;
  back?: { href: string; label: string };
  children: (context: AdminContext) => ReactNode;
}

function TokenForm({ notice, onSubmit }: { notice: string | null; onSubmit: (token: string) => void }) {
  const [value, setValue] = useState("");
  function handle(event: FormEvent) {
    event.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  }
  return (
    <form onSubmit={handle}>
      <p>運営者のトークンを入力してください。このブラウザにだけ保存されます。</p>
      <label htmlFor="admin-token" className="form-label fw-bold">
        運営者のトークン
      </label>
      <input
        id="admin-token"
        type="password"
        autoComplete="off"
        className="form-control mb-3"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {notice && (
        <div className="alert alert-danger" role="alert">
          {notice}
        </div>
      )}
      <button type="submit" className="btn btn-primary w-100" disabled={!value.trim()}>
        入力する
      </button>
    </form>
  );
}

export function AdminShell({ title, back, children }: Props) {
  const [token, setToken] = useState<string | null>(() => loadAdminToken());
  const [notice, setNotice] = useState<string | null>(null);
  // 再描画のたびに作り直すと、読み込みが繰り返されるため、トークンが変わるときだけ作る
  const api = useMemo(() => (token ? createAdminApi(token) : null), [token]);

  const describeError = useCallback((error: unknown): string => {
    if (error instanceof ApiError && error.status === 401) {
      clearAdminToken();
      setToken(null);
      setNotice("トークンが正しくありません。もう一度入力してください。");
      return "トークンが正しくありません。";
    }
    return error instanceof ApiError ? error.message : "エラーが発生しました。";
  }, []);

  function signOut() {
    clearAdminToken();
    setToken(null);
    setNotice(null);
  }

  return (
    <main className="container py-4" style={{ maxWidth: 640 }}>
      <nav className="d-flex justify-content-between align-items-center mb-3 small">
        {back ? <a href={back.href}>← {back.label}</a> : <span>運営者の画面</span>}
        {token && (
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={signOut}>
            トークンを消す
          </button>
        )}
      </nav>
      <h1 className="h4 mb-3">{title}</h1>
      {api ? (
        children({ api, describeError })
      ) : (
        <TokenForm
          notice={notice}
          onSubmit={(t) => {
            saveAdminToken(t);
            setNotice(null);
            setToken(t);
          }}
        />
      )}
    </main>
  );
}
