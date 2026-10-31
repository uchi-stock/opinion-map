import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParticipantPage } from "../src/pages/ParticipantPage.tsx";
import type { OpinionKind } from "../src/api/types.ts";
import { json, opinion, postCalls, SESSION, stubFetch } from "./helpers.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** テーマと意見一覧に応答する、簡単なバックエンドの代わり */
function fakeBackend(options: { session?: object; opinions?: object[]; hidden?: boolean } = {}) {
  const stored = [...(options.opinions ?? [])];
  const mock = stubFetch((url, init) => {
    if (url.endsWith("/opinions") && init?.method === "POST") {
      const sent = JSON.parse(String(init.body)) as { body: string; kind: OpinionKind };
      const created = opinion(`new-${stored.length + 1}`, sent.body, sent.kind, "2026-01-01T01:00:00.000Z");
      stored.push(created);
      return json({ opinion: created, duplicate: false }, 201);
    }
    if (url.endsWith("/opinions")) return json({ hidden: options.hidden ?? false, opinions: stored });
    return json({ ...SESSION, ...options.session });
  });
  return mock;
}

describe("参加者の画面", () => {
  it("イベント名・タイトル・問い・投稿についての案内を表示する", async () => {
    fakeBackend();
    render(<ParticipantPage sessionId="s1" />);
    expect(await screen.findByText(SESSION.prompt)).toBeInTheDocument();
    expect(screen.getByText(SESSION.eventName)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: SESSION.title })).toBeInTheDocument();
    const notice = screen.getByRole("region", { name: "投稿について" });
    expect(within(notice).getByText(/名前の入力は不要/)).toBeInTheDocument();
    expect(within(notice).getByText(/AIを使って意見を分析/)).toBeInTheDocument();
  });

  it("投稿された意見を、新しい順にカードで表示する", async () => {
    fakeBackend({
      opinions: [
        opinion("o1", "古い意見", "idea", "2026-01-01T00:00:00.000Z"),
        opinion("o2", "新しい意見", "experience", "2026-01-01T00:05:00.000Z"),
      ],
    });
    render(<ParticipantPage sessionId="s1" />);
    const cards = await screen.findAllByTestId("opinion-card");
    expect(cards.map((c) => c.textContent)).toEqual([expect.stringContaining("新しい意見"), expect.stringContaining("古い意見")]);
  });

  it("意見がまだないときは、その旨を表示する", async () => {
    fakeBackend();
    render(<ParticipantPage sessionId="s1" />);
    expect(await screen.findByText("まだ投稿はありません。")).toBeInTheDocument();
  });

  it("投稿を受け付けていないときは、フォームを出さない", async () => {
    fakeBackend({ session: { acceptingOpinions: false, status: "closed" } });
    render(<ParticipantPage sessionId="s1" />);
    expect(await screen.findByText("現在、投稿を受け付けていません。")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("一覧を見せない設定のときは、一覧を出さず、案内にも書く", async () => {
    fakeBackend({ session: { showOpinions: false }, hidden: true });
    render(<ParticipantPage sessionId="s1" />);
    expect(await screen.findByText(/運営者にだけ表示されます/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "投稿された意見" })).toBeNull();
  });

  it("存在しないテーマでは、見つからない旨を表示する", async () => {
    stubFetch(() => json({ error: { code: "not_found", message: "テーマが見つかりません" } }, 404));
    render(<ParticipantPage sessionId="nope" />);
    expect(await screen.findByText("ページが見つかりません")).toBeInTheDocument();
  });

  it("通信に失敗したときは、エラーと再読み込みのボタンを出し、押すと読み込み直す", async () => {
    let fail = true;
    stubFetch((url) => {
      if (fail) throw new TypeError("Failed to fetch");
      return url.endsWith("/opinions") ? json({ hidden: false, opinions: [] }) : json(SESSION);
    });
    render(<ParticipantPage sessionId="s1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("通信に失敗しました");
    fail = false;
    await userEvent.setup().click(screen.getByRole("button", { name: "もう一度読み込む" }));
    expect(await screen.findByText(SESSION.prompt)).toBeInTheDocument();
  });

  it("投稿すると、一覧に自分の意見が加わる", async () => {
    const mock = fakeBackend({ opinions: [opinion("o1", "既存の意見")] });
    const user = userEvent.setup();
    render(<ParticipantPage sessionId="s1" />);
    await user.type(await screen.findByRole("textbox", { name: "あなたの意見" }), "私の意見です");
    await user.click(screen.getByRole("button", { name: "投稿する" }));
    expect(await screen.findByText("私の意見です")).toBeInTheDocument();
    expect(screen.getByText("既存の意見")).toBeInTheDocument();
    expect(postCalls(mock)).toHaveLength(1);
    const [, init] = postCalls(mock)[0] ?? [];
    const sent = JSON.parse(String((init as RequestInit).body));
    expect(sent).toMatchObject({ body: "私の意見です", kind: "idea" });
    // 送るのは、本文・種類・送信ID・編集用の鍵だけ。鍵は投稿ごとの乱数で、送信IDとは別の値
    expect(Object.keys(sent).sort()).toEqual(["body", "editKey", "kind", "submissionId"]);
    expect(sent.editKey).toMatch(/^[A-Za-z0-9_-]{22,128}$/);
    expect(sent.editKey).not.toBe(sent.submissionId);
  });

  it("自分の投稿にだけ、編集と削除の操作を出す", async () => {
    window.localStorage.removeItem("opinion-map-my-opinions");
    fakeBackend({ opinions: [opinion("o1", "他の人の意見")] });
    const user = userEvent.setup();
    render(<ParticipantPage sessionId="s1" />);
    await user.type(await screen.findByRole("textbox", { name: "あなたの意見" }), "私の意見です");
    await user.click(screen.getByRole("button", { name: "投稿する" }));
    await screen.findByText("私の意見です");
    // 操作が出るのは、自分の投稿の1件だけ
    expect(screen.getAllByRole("button", { name: "編集する" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "削除する" })).toHaveLength(1);
  });

  it("投稿を受け付けていないときは、削除だけできる", async () => {
    window.localStorage.setItem("opinion-map-my-opinions", JSON.stringify({ o1: "k".repeat(22) }));
    fakeBackend({ session: { acceptingOpinions: false }, opinions: [opinion("o1", "自分の意見")] });
    render(<ParticipantPage sessionId="s1" />);
    await screen.findByText("自分の意見");
    expect(screen.queryByRole("button", { name: "編集する" })).toBeNull();
    expect(screen.getByRole("button", { name: "削除する" })).toBeInTheDocument();
    window.localStorage.removeItem("opinion-map-my-opinions");
  });

  it("連打しても、投稿は1回だけ送られる", async () => {
    const mock = fakeBackend();
    const user = userEvent.setup();
    render(<ParticipantPage sessionId="s1" />);
    await user.type(await screen.findByRole("textbox", { name: "あなたの意見" }), "一度だけ");
    const button = screen.getByRole("button", { name: "投稿する" });
    await user.dblClick(button);
    await waitFor(() => expect(screen.getAllByTestId("opinion-card")).toHaveLength(1));
    expect(postCalls(mock)).toHaveLength(1);
  });

  it("スクリプトを含む既存の投稿でも、実行されず文字として表示される", async () => {
    const evil = `<script>document.title="hacked"</script>`;
    fakeBackend({ opinions: [opinion("o1", evil)] });
    const { container } = render(<ParticipantPage sessionId="s1" />);
    expect(await screen.findByText(evil)).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(document.title).not.toBe("hacked");
  });

  it("更新ボタンで、一覧を読み直す", async () => {
    const mock = fakeBackend();
    const user = userEvent.setup();
    render(<ParticipantPage sessionId="s1" />);
    await screen.findByText("まだ投稿はありません。");
    const before = mock.mock.calls.filter(([u]) => String(u).endsWith("/opinions")).length;
    await user.click(screen.getByRole("button", { name: "更新" }));
    await waitFor(() =>
      expect(mock.mock.calls.filter(([u]) => String(u).endsWith("/opinions")).length).toBe(before + 1),
    );
  });
});

describe("ボード表示", () => {
  it("一覧からボードに切り替えると、種類ごとに付箋が並ぶ", async () => {
    stubFetch((url) =>
      url.endsWith("/opinions")
        ? json({ hidden: false, opinions: [opinion("o1", "駅から遠い", "experience"), opinion("o2", "予約はどうする？", "question")] })
        : json(SESSION),
    );
    render(<ParticipantPage sessionId="s1" />);
    expect(await screen.findByText("駅から遠い")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ボード" }));
    expect(await screen.findByTestId("sticky-board")).toBeInTheDocument();
    expect(screen.getAllByTestId("sticky-note")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "経験" })).toBeInTheDocument();
    expect(screen.queryByTestId("opinion-card")).toBeNull();
  });
});

describe("見ていることの通知", () => {
  it("開いた直後に、端末のID(個人を特定しない乱数)で知らせる。失敗しても画面は変わらない", async () => {
    const mock = stubFetch((url, init) => {
      if (url.endsWith("/presence") && init?.method === "POST") return json({ error: { code: "server_error", message: "失敗" } }, 500);
      if (url.endsWith("/sessions/s1")) return json(SESSION);
      if (url.endsWith("/opinions")) return json({ hidden: false, opinions: [] });
      return json({ error: { code: "not_found", message: "なし" } }, 404);
    });
    render(<ParticipantPage sessionId="s1" />);
    await screen.findByRole("form", { name: "意見の投稿フォーム" });
    const sent = mock.mock.calls.filter(([url]) => String(url).endsWith("/sessions/s1/presence"));
    expect(sent).toHaveLength(1);
    const body = JSON.parse(String((sent[0]![1] as RequestInit).body)) as { deviceId: string };
    expect(body.deviceId).toMatch(/^[A-Za-z0-9_-]{22,128}$/);
  });
});
