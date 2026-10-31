import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import UpdateNotifier from "../src/pwa/UpdateNotifier.jsx";

/** navigator.serviceWorker の代わり。controllerchange を、テストから起こせる */
function stubServiceWorker(controller: object | null) {
  const listeners = new Set<() => void>();
  vi.stubGlobal("navigator", {
    ...navigator,
    serviceWorker: {
      controller,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    },
  });
  return { fire: () => listeners.forEach((fn) => fn()), count: () => listeners.size };
}

afterEach(() => {
  // 画面の片付け(監視の解除で navigator.serviceWorker を使う)を、スタブを戻す前に行う
  cleanup();
  vi.unstubAllGlobals();
});

describe("更新の通知", () => {
  it("すでに Service Worker の下で開いていたとき、新しい版に切り替わったら、再読み込みを促す", async () => {
    const sw = stubServiceWorker({});
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    const user = userEvent.setup();
    render(<UpdateNotifier />);
    expect(screen.queryByText("新しいバージョンがあります")).toBeNull();

    act(() => sw.fire());
    expect(await screen.findByText("新しいバージョンがあります")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "更新する" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("初めてのインストールでは、出さない", () => {
    const sw = stubServiceWorker(null);
    render(<UpdateNotifier />);
    act(() => sw.fire());
    expect(screen.queryByText("新しいバージョンがあります")).toBeNull();
  });

  it("Service Worker が使えない環境(古いブラウザなど)でも、例外を投げない", () => {
    // 対応していないブラウザは、serviceWorker という項目自体を持たない
    const { serviceWorker: _unsupported, ...rest } = navigator as Navigator & { serviceWorker?: unknown };
    vi.stubGlobal("navigator", rest);
    expect(() => render(<UpdateNotifier />)).not.toThrow();
  });

  it("画面を離れたら、監視をやめる", () => {
    const sw = stubServiceWorker({});
    const { unmount } = render(<UpdateNotifier />);
    expect(sw.count()).toBe(1);
    unmount();
    expect(sw.count()).toBe(0);
  });
});
