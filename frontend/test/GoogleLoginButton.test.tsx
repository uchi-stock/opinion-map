import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleLoginButton } from "../src/components/admin/GoogleLoginButton.tsx";
import { json, stubFetch } from "./helpers.ts";

type Callback = (response: { credential: string }) => void;

function fakeGoogle() {
  let callback: Callback | undefined;
  const initialize = vi.fn((config: { client_id: string; callback: Callback }) => {
    callback = config.callback;
  });
  const renderButton = vi.fn();
  window.google = { accounts: { id: { initialize, renderButton } } };
  return { initialize, renderButton, signIn: (credential: string) => callback?.({ credential }) };
}

afterEach(() => {
  delete window.google;
  vi.unstubAllGlobals();
});

describe("GoogleLoginButton", () => {
  it("クライアントIDでGoogleのボタンを描画する", async () => {
    const g = fakeGoogle();
    render(<GoogleLoginButton clientId="client-1" onLogin={vi.fn()} />);
    await waitFor(() => expect(g.renderButton).toHaveBeenCalled());
    expect(g.initialize).toHaveBeenCalledWith(expect.objectContaining({ client_id: "client-1" }));
  });

  it("親が再描画されても、ボタンを作り直さない", async () => {
    const g = fakeGoogle();
    const { rerender } = render(<GoogleLoginButton clientId="client-1" onLogin={vi.fn()} />);
    await waitFor(() => expect(g.renderButton).toHaveBeenCalledTimes(1));
    rerender(<GoogleLoginButton clientId="client-1" onLogin={vi.fn()} />);
    rerender(<GoogleLoginButton clientId="client-1" onLogin={vi.fn()} />);
    expect(g.renderButton).toHaveBeenCalledTimes(1);
  });

  it("Googleのトークンをセッショントークンに交換して、渡す", async () => {
    const g = fakeGoogle();
    const mock = stubFetch(() => json({ token: "session-token", email: "owner@example.com", expiresAt: "x" }));
    const onLogin = vi.fn();
    render(<GoogleLoginButton clientId="client-1" onLogin={onLogin} />);
    await waitFor(() => expect(g.renderButton).toHaveBeenCalled());
    g.signIn("google-id-token");
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith("session-token"));
    const [url, init] = mock.mock.calls[0]!;
    expect(String(url)).toContain("/auth/session");
    expect((init as RequestInit).headers).toEqual({ authorization: "Bearer google-id-token" });
  });

  it("登録されていないアカウントは、理由を出して、ログインさせない", async () => {
    const g = fakeGoogle();
    stubFetch(() => json({ error: { code: "not_owner", message: "x" } }, 403));
    const onLogin = vi.fn();
    render(<GoogleLoginButton clientId="client-1" onLogin={onLogin} />);
    await waitFor(() => expect(g.renderButton).toHaveBeenCalled());
    g.signIn("t");
    expect(await screen.findByRole("alert")).toHaveTextContent("運営者として登録されていません");
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("バックエンドが未設定(503)なら、その旨を出す", async () => {
    const g = fakeGoogle();
    stubFetch(() => json({ error: { code: "login_unavailable", message: "x" } }, 503));
    render(<GoogleLoginButton clientId="client-1" onLogin={vi.fn()} />);
    await waitFor(() => expect(g.renderButton).toHaveBeenCalled());
    g.signIn("t");
    expect(await screen.findByRole("alert")).toHaveTextContent("まだ設定されていません");
  });
});
