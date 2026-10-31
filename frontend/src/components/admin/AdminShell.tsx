import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createAdminApi, type AdminApi } from "../../api/admin.ts";
import { ApiError } from "../../api/client.ts";
import { AccountMenu } from "./AccountMenu.tsx";
import { GoogleLoginButton } from "./GoogleLoginButton.tsx";
import { clearAdminToken, loadAdminToken, saveAdminToken } from "../../lib/adminToken.ts";
import { withBase } from "../../lib/paths.ts";

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

/** Googleログインのクライアントを指定するビルド設定。未設定なら、ボタンを出さない */
const GOOGLE_CLIENT_ID = (import.meta.env["VITE_GOOGLE_CLIENT_ID"] as string | undefined) ?? "";

function TokenForm({ notice, onSubmit }: { notice: string | null; onSubmit: (token: string) => void }) {
  const [value, setValue] = useState("");
  function handle(event: FormEvent) {
    event.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  }
  return (
    <form onSubmit={handle}>
      {GOOGLE_CLIENT_ID && (
        <>
          <p>オーナーは、Googleアカウントでログインします。</p>
          <GoogleLoginButton clientId={GOOGLE_CLIENT_ID} onLogin={onSubmit} />
          <hr />
          <p>運営者のリンクのトークンや、合言葉でも入れます。</p>
        </>
      )}
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
      <button type="submit" className="btn icon-btn btn-primary w-100" disabled={!value.trim()} aria-label="入力する" title="入力する">🔑</button>
    </form>
  );
}

const TOKEN_FRAGMENT = /^#token=(.+)$/;

/**
 * 共有されたリンクの `#token=...` を取り込み、アドレスから消す。
 * フラグメントはサーバーに送られず、アクセスログにも残らない。
 */
function takeTokenFromUrl(): string | null {
  try {
    const match = TOKEN_FRAGMENT.exec(window.location.hash);
    if (!match) return null;
    const token = decodeURIComponent(match[1]!);
    saveAdminToken(token);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    return token;
  } catch {
    return null;
  }
}

export function AdminShell({ title, back, children }: Props) {
  const [token, setToken] = useState<string | null>(() => takeTokenFromUrl() ?? loadAdminToken());
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
      <nav className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3 small" aria-label="運営者の画面のナビゲーション">
        {back ? (
          <a className="btn icon-btn btn-sm btn-outline-secondary" href={back.href} aria-label={back.label} title={back.label}>
            ⬅️
          </a>
        ) : (
          <span aria-hidden="true">🛠️</span>
        )}
        <div className="d-flex align-items-center gap-2">
          <a className="btn icon-btn btn-sm btn-outline-secondary" href={withBase("/")} aria-label="トップページ" title="トップページ">🏠</a>
          {/* ログイン中のアカウントは、右上に出す */}
          {api && <AccountMenu api={api} onSignOut={signOut} />}
        </div>
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
