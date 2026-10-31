import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routeOf } from "../src/App.tsx";
import { ParticipantEventPage } from "../src/pages/ParticipantEventPage.tsx";
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
    expect(screen.getByRole("form", { name: "意見の投稿フォーム" })).toBeInTheDocument();
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
  });
});
