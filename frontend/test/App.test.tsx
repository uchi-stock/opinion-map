import { render, screen } from "@testing-library/react";
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

  it("セッションのURLでは、参加者の画面を開く", async () => {
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
