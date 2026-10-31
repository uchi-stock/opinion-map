import { useEffect, useRef, useState } from "react";
import type { AdminApi } from "../../api/admin.ts";
import type { Me } from "../../api/types.ts";
import { Avatar } from "./Avatar.tsx";

/**
 * ログイン中のアカウントを、左上のアイコンで示す。タップすると、アカウントの情報と「ログアウト」が出る。
 * アカウントの情報を読めなくても(通信の失敗など)、ログアウトはできる。
 */
export function AccountMenu({ api, onSignOut }: { api: AdminApi; onSignOut: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api.me().then(
      (value) => {
        if (!cancelled) setMe(value);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  // 外側をタップするか、Esc を押すと閉じる
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const description = me?.email ?? (me?.role === "operator" ? "運営者のトークンでログイン中" : "トークンでログイン中");

  return (
    <div className="position-relative" ref={root}>
      <button
        type="button"
        className="btn btn-link p-0 border-0 rounded-circle"
        aria-label="アカウントのメニュー"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar email={me?.email} picture={me?.picture} size={36} label="ログイン中のアカウント" />
      </button>
      {open && (
        <div
          role="menu"
          className="position-absolute start-0 mt-1 card shadow-sm p-2"
          style={{ zIndex: 1050, minWidth: 220, maxWidth: "80vw" }}
        >
          <p className="small text-body-secondary mb-2 text-break">{description}</p>
          <button type="button" role="menuitem" className="btn btn-sm btn-outline-danger w-100" onClick={onSignOut}>
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
}
