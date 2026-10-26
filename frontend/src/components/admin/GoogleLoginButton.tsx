import { useEffect, useRef, useState } from "react";
import { ApiError, request } from "../../api/client.ts";

/** Google Identity Services のうち、使う部分だけ */
interface GoogleIdentity {
  accounts: {
    id: {
      initialize(config: { client_id: string; callback: (response: { credential: string }) => void }): void;
      renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
    };
  };
}
declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

const SCRIPT_URL = "https://accounts.google.com/gsi/client";

function loadScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("load_failed")));
    if (!existing) {
      script.src = SCRIPT_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

/** GoogleのIDトークンを、バックエンドのセッショントークンに交換する。ログイン時の1回だけ使う */
export function exchangeGoogleIdToken(idToken: string): Promise<{ token: string; email: string }> {
  return request("/auth/session", { method: "POST", headers: { authorization: `Bearer ${idToken}` } });
}

function messageOf(e: unknown): string {
  if (e instanceof ApiError && e.code === "not_owner") return "このGoogleアカウントは、運営者として登録されていません。";
  if (e instanceof ApiError && e.status === 503) return "Googleログインは、まだ設定されていません。";
  if (e instanceof ApiError) return e.message;
  return "ログインに失敗しました。もう一度お試しください。";
}

/**
 * 「Googleでログイン」のボタン。オーナーだけが使う。
 * Googleのトークンは、交換のためにだけ使い、保存しない。
 */
export function GoogleLoginButton({ clientId, onLogin }: { clientId: string; onLogin: (sessionToken: string) => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  // 親が再描画されても、ボタンを作り直さないよう、最新の関数を参照で持つ
  const latestOnLogin = useRef(onLogin);
  latestOnLogin.current = onLogin;

  useEffect(() => {
    let cancelled = false;
    loadScript().then(
      () => {
        if (cancelled || !holder.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            setError(null);
            exchangeGoogleIdToken(response.credential).then(
              (session) => latestOnLogin.current(session.token),
              (e) => setError(messageOf(e)),
            );
          },
        });
        window.google.accounts.id.renderButton(holder.current, { theme: "outline", size: "large", text: "signin_with", locale: "ja" });
      },
      () => setError("Googleのログイン画面を読み込めませんでした。電波の良い場所で、もう一度お試しください。"),
    );
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <div className="mb-3">
      <div ref={holder} aria-label="Googleでログイン" role="group" />
      {error && (
        <div className="alert alert-danger mt-2 mb-0" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
