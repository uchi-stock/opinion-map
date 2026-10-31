import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routeOf } from "../src/App.tsx";
import { ParticipantEventPage, REFRESH_INTERVAL_MS } from "../src/pages/ParticipantEventPage.tsx";
import { json, opinion, SESSION, stubFetch } from "./helpers.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

const sessionA = { ...SESSION, id: "sa", title: "テーマA", prompt: "Aの問い", eventId: "e1", isOpen: false, opinionCount: 1, acceptingOpinions: false };
const sessionB = { ...SESSION, id: "sb", title: "テーマB", prompt: "Bの問い", eventId: "e1", isOpen: true, opinionCount: 2, acceptingOpinions: true };

function backend() {
  return stubFetch((url) => {
    if (url.endsWith("/events/e1/public")) {
      return json({ id: "e1", name: "ワークショップ", description: "", openSessionIds: ["sb"], sessions: [sessionA, sessionB] });
    }
    if (url.endsWith("/sessions/sa")) return json(sessionA);
    if (url.endsWith("/sessions/sb")) return json(sessionB);
    if (url.endsWith("/sessions/sa/opinions")) return json({ hidden: false, opinions: [opinion("o1", "Aの意見")] });
    if (url.endsWith("/sessions/sb/opinions")) return json({ hidden: false, opinions: [opinion("o2", "Bの意見")] });
    return json({ error: { code: "not_found", message: "なし" } }, 404);
  });
}

describe("ルーティング", () => {
  it("/e/<イベントID> は、招待URLの画面になる", () => {
    expect(routeOf("/e/e1")).toEqual({ page: "event", eventId: "e1" });
    expect(routeOf("/s/s1")).toEqual({ page: "session", sessionId: "s1" });
  });
});

describe("招待URLの画面", () => {
  it("いまのテーマを開き、投稿できる。投稿中の印が付く", async () => {
    backend();
    render(<ParticipantEventPage eventId="e1" />);
    expect(await screen.findByText("Bの問い")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /テーマB/ })).toHaveAttribute("aria-pressed", "true");
    const nav = within(screen.getByRole("navigation", { name: "テーマの切り替え" }));
    expect(nav.getByText("投稿中")).toBeInTheDocument();
    expect(nav.getByText("閲覧のみ")).toBeInTheDocument();
    expect(nav.getByText("（2件）")).toBeInTheDocument();
    // 基本は、ボード。投稿は、リンクから開く
    expect(await screen.findByRole("link", { name: "意見を投稿する" })).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "意見の投稿フォーム" })).toBeNull();
  });

  it("別のテーマを選ぶと、その意見を見られる。投稿はできない旨を出す", async () => {
    backend();
    const user = userEvent.setup();
    render(<ParticipantEventPage eventId="e1" />);
    await screen.findByText("Bの問い");
    await user.click(screen.getByRole("button", { name: /テーマA/ }));
    expect(await screen.findByText("Aの問い")).toBeInTheDocument();
    expect(await screen.findByText("Aの意見")).toBeInTheDocument();
    expect(screen.getByText(/いま投稿を受け付けていません。意見を見ることはできます/)).toBeInTheDocument();
  });

  it("イベントが見つからないときは、案内を出す", async () => {
    stubFetch(() => json({ error: { code: "not_found", message: "なし" } }, 404));
    render(<ParticipantEventPage eventId="nope" />);
    expect(await screen.findByText("ページが見つかりません")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "トップページへ" })).toHaveAttribute("href", "/");
  });
});

describe("自動更新", () => {
  it("運営者がテーマを開閉すると、一定時間後に、画面が追従する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let open = ["sb"];
      stubFetch((url) => {
        if (url.endsWith("/events/e1/public")) {
          const a = { ...sessionA, isOpen: open.includes("sa"), acceptingOpinions: open.includes("sa") };
          const b = { ...sessionB, isOpen: open.includes("sb"), acceptingOpinions: open.includes("sb") };
          return json({ id: "e1", name: "ワークショップ", description: "", openSessionIds: open, sessions: [a, b] });
        }
        if (url.endsWith("/sessions/sb")) return json(sessionB);
        if (url.endsWith("/sessions/sb/opinions")) return json({ hidden: false, opinions: [] });
        return json({ error: { code: "not_found", message: "なし" } }, 404);
      });
      render(<ParticipantEventPage eventId="e1" />);
      const nav = () => within(screen.getByRole("navigation", { name: "テーマの切り替え" }));
      await screen.findByText("Bの問い");
      expect(nav().getAllByText("投稿中")).toHaveLength(1);

      open = ["sa", "sb"];
      await act(async () => {
        await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS + 100);
      });
      expect(nav().getAllByText("投稿中")).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("更新に失敗しても、いまの表示は変わらない", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let fail = false;
      stubFetch((url) => {
        if (url.endsWith("/events/e1/public")) {
          if (fail) return json({ error: { code: "server_error", message: "失敗" } }, 500);
          return json({ id: "e1", name: "ワークショップ", description: "", openSessionIds: ["sb"], sessions: [sessionA, sessionB] });
        }
        if (url.endsWith("/sessions/sb")) return json(sessionB);
        if (url.endsWith("/sessions/sb/opinions")) return json({ hidden: false, opinions: [] });
        return json({ error: { code: "not_found", message: "なし" } }, 404);
      });
      render(<ParticipantEventPage eventId="e1" />);
      await screen.findByText("Bの問い");
      fail = true;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS + 100);
      });
      expect(screen.getByText("Bの問い")).toBeInTheDocument();
      expect(screen.queryByText(/失敗/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("テーマの一覧", () => {
  it("公開中のテーマを、すべて、リストで見せる。投稿中と閲覧のみの印が付く", async () => {
    backend();
    render(<ParticipantEventPage eventId="e1" />);
    await screen.findByText("Bの問い");
    const nav = within(screen.getByRole("navigation", { name: "テーマの切り替え" }));
    const items = nav.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("閲覧のみ")).toBeInTheDocument();
    expect(within(items[1]!).getByText("投稿中")).toBeInTheDocument();
    expect(nav.getByText("テーマ（2件）")).toBeInTheDocument();
  });
});

describe("開始を待つ案内", () => {
  it("下書きのイベントは、まだ始まっていないと出し、公開されたら自動で切り替わる", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let draft = true;
      stubFetch((url) => {
        if (url.endsWith("/events/e1/public")) {
          return draft
            ? json({ id: "e1", status: "draft", name: "", description: "", openSessionIds: null, sessions: [] })
            : json({ id: "e1", status: "active", name: "ワークショップ", description: "", openSessionIds: ["sb"], sessions: [sessionB] });
        }
        if (url.endsWith("/sessions/sb")) return json(sessionB);
        if (url.endsWith("/sessions/sb/opinions")) return json({ hidden: false, opinions: [] });
        return json({ error: { code: "not_found", message: "なし" } }, 404);
      });
      render(<ParticipantEventPage eventId="e1" />);
      expect(await screen.findByText("このイベントは、まだ始まっていません")).toBeInTheDocument();
      expect(screen.getByText(/開始をお待ちください/)).toBeInTheDocument();
      draft = false;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS + 100);
      });
      expect(await screen.findByText("Bの問い")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("公開済みでも、テーマがまだ無いときは、開始をお待ちくださいと出す", async () => {
    stubFetch((url) =>
      url.endsWith("/events/e1/public")
        ? json({ id: "e1", status: "active", name: "ワークショップ", description: "", openSessionIds: null, sessions: [] })
        : json({ error: { code: "not_found", message: "なし" } }, 404),
    );
    render(<ParticipantEventPage eventId="e1" />);
    expect(await screen.findByText("テーマは、まだ公開されていません")).toBeInTheDocument();
    expect(screen.getByText(/開始をお待ちください/)).toBeInTheDocument();
  });
});
