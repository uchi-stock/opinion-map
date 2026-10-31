import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportClientError } from "../src/api/client.ts";
import { ErrorBoundary } from "../src/components/ErrorBoundary.tsx";
import { json, stubFetch } from "./helpers.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Boom(): never {
  throw new Error("描画で失敗");
}

describe("ErrorBoundary", () => {
  it("描画エラーを受け止め、案内を出し、サーバーに報告する(パスだけ。クエリとハッシュは送らない)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    window.history.replaceState(null, "", "/e/abc?token=secret#frag");
    const mock = stubFetch(() => json({ received: true }, 202));
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("画面でエラーが起きました");
    expect(screen.getByRole("button", { name: "もう一度読み込む" })).toBeInTheDocument();
    await vi.waitFor(() => expect(mock).toHaveBeenCalled());
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/client-errors$/);
    const body = JSON.parse(String(init.body));
    expect(body.message).toBe("Error: 描画で失敗");
    expect(body.path).toBe("/e/abc");
    expect(String(init.body)).not.toContain("secret");
    window.history.replaceState(null, "", "/");
  });

  it("エラーが無ければ、そのまま中身を出す", () => {
    render(
      <ErrorBoundary>
        <p>正常</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("正常")).toBeInTheDocument();
  });

  it("報告の通信が失敗しても、例外を出さない", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(() => reportClientError(new Error("x"))).not.toThrow();
    await userEvent.setup();
  });
});
