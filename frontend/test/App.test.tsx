import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App, routeOf } from "../src/App.tsx";
import { VersionInfo } from "../src/components/VersionInfo.tsx";
import { json, SESSION, stubFetch } from "./helpers.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ルーティング", () => {
  it("パスから画面を決める", () => {
    expect(routeOf("/")).toEqual({ page: "top" });
    expect(routeOf("/s/abc-123")).toEqual({ page: "session", sessionId: "abc-123" });
    expect(routeOf("/s/abc-123/")).toEqual({ page: "session", sessionId: "abc-123" });
    expect(routeOf("/s/")).toEqual({ page: "notFound" });
    expect(routeOf("/other")).toEqual({ page: "notFound" });
  });

  it("トップページにキャッチコピーと、バージョン・更新日時を表示する", () => {
    render(<App pathname="/" />);
    expect(screen.getByText("意見の違いを、対話のきっかけに。")).toBeInTheDocument();
    expect(screen.getByText(/バージョン:/)).toBeInTheDocument();
    expect(screen.getByText(/更新日時:/)).toBeInTheDocument();
  });

  it("トップページから、管理者ログイン(/admin)へ移れる", () => {
    render(<App pathname="/" />);
    expect(screen.getByRole("link", { name: "管理者ログイン" })).toHaveAttribute("href", "/admin");
  });

  it("存在しないパスでは、見つからない旨を表示する", () => {
    render(<App pathname="/nowhere" />);
    expect(screen.getByText("ページが見つかりません")).toBeInTheDocument();
  });

  it("テーマのURLでは、参加者の画面を開く", async () => {
    stubFetch((url) => (url.endsWith("/opinions") ? json({ hidden: false, opinions: [] }) : json(SESSION)));
    render(<App pathname="/s/s1" />);
    expect(await screen.findByText(SESSION.prompt)).toBeInTheDocument();
  });
});

describe("バージョン表示", () => {
  it("更新日時を日本時間で表示する", () => {
    render(<VersionInfo version="1.2.3" builtAt="2026-01-01T00:00:00.000Z" />);
    expect(screen.getByText("バージョン: 1.2.3")).toBeInTheDocument();
    expect(screen.getByText(/2026\/01\/01 09:00（日本時間）/)).toBeInTheDocument();
  });

  it("日時が不正なら、不明と表示する", () => {
    render(<VersionInfo version="1.0.0" builtAt="invalid" />);
    expect(screen.getByText(/更新日時: 不明/)).toBeInTheDocument();
  });
});

describe("トップページのサンプル", () => {
  it("盛り上がったサンプルのボードを見せ、サンプルと分かる表示と、招待リンクの案内も残す", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<App pathname="/" />);
    const sample = screen.getByRole("region", { name: "サンプル" });
    expect(within(sample).getByText("サンプル")).toBeInTheDocument();
    expect(within(sample).getByText(/何も保存されません/)).toBeInTheDocument();
    expect(within(sample).getAllByTestId("sticky-note").length).toBeGreaterThanOrEqual(10);
    // 少数意見も、サンプルに含める
    expect(within(sample).getByRole("region", { name: "どこにも入らなかった意見" })).toBeInTheDocument();
    expect(screen.getByText(/運営者から共有されたURLを開いてください/)).toBeInTheDocument();
    // APIを呼ばない
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
