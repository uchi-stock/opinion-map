import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordScreen } from "../src/components/participant/RecordScreen.tsx";
import { loadTranscriptDraft } from "../src/lib/transcriptDraft.ts";
import { json, opinion, postCalls, stubFetch } from "./helpers.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function setup(over: Partial<Parameters<typeof RecordScreen>[0]> = {}) {
  const onBack = vi.fn();
  const onPosted = vi.fn();
  let counter = 0;
  const fetchMock = stubFetch((url, init) => {
    if (url.endsWith("/transcript")) {
      const { text } = JSON.parse(String(init?.body));
      if (text.includes("エラー")) return json({ error: { code: "daily_limit", message: "今日の上限に達しました" } }, 429);
      if (text.includes("なし")) return json({ candidates: [] });
      return json({ candidates: [{ body: "駅が遠い", kind: "experience" }, { body: "犬は入れる？", kind: "question" }] });
    }
    if (url.endsWith("/opinions") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      if (body.body.includes("失敗")) return json({ error: { code: "x", message: "投稿に失敗しました" } }, 500);
      return json({ opinion: opinion(`o${++counter}`, body.body, body.kind), duplicate: false }, 201);
    }
    return json({});
  });
  render(<RecordScreen accepting sessionId="s1" onBack={onBack} onPosted={onPosted} {...over} />);
  return { onBack, onPosted, fetchMock, user: userEvent.setup() };
}

describe("RecordScreen（話した内容から付箋を作る）", () => {
  beforeEach(() => window.localStorage.clear());

  it("音声の扱いを説明する。録音に対応していないときは、文字で入れるよう案内する", () => {
    setup();
    expect(screen.getByText(/サーバーには送りません/)).toBeInTheDocument();
    expect(screen.getByText(/音声の録音を使えません/)).toBeInTheDocument();
  });

  it("文字から候補を作り、直して、選んだものだけを投稿する。投稿できたら、下書きを消して知らせる", async () => {
    const { user, fetchMock, onPosted } = setup();
    await user.type(screen.getByLabelText("話した内容（文字）"), "駅が遠いです。犬は入れますか");
    expect(loadTranscriptDraft("s1")).toBe("駅が遠いです。犬は入れますか");
    await user.click(screen.getByRole("button", { name: "付箋の候補を作る" }));
    const boxes = await screen.findAllByRole("checkbox", { name: "この付箋を投稿する" });
    expect(boxes).toHaveLength(2);
    expect(screen.getByText(/2件を選んでいます/)).toBeInTheDocument();
    await user.click(boxes[1]!);
    const edit = screen.getAllByLabelText("付箋の内容")[0]!;
    await user.clear(edit);
    await user.type(edit, "駅から遠いのが大変");
    await user.click(screen.getByRole("button", { name: "選んだ付箋を投稿する" }));
    await waitFor(() => expect(onPosted).toHaveBeenCalledWith(1));
    const posts = postCalls(fetchMock).filter(([url]) => String(url).endsWith("/opinions"));
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String((posts[0]![1] as RequestInit).body))).toMatchObject({ body: "駅から遠いのが大変", kind: "experience" });
    expect(loadTranscriptDraft("s1")).toBe("");
  });

  it("下書きは、開き直しても残る。「文字を消す」で消せる", async () => {
    window.localStorage.setItem("opinion-map:transcript:s1", "前の内容");
    const { user } = setup();
    const box = screen.getByLabelText("話した内容（文字）");
    expect(box).toHaveValue("前の内容");
    await user.click(screen.getByRole("button", { name: "文字を消す" }));
    expect(box).toHaveValue("");
    expect(loadTranscriptDraft("s1")).toBe("");
  });

  it("文字が空のときは、候補を作れない。戻るボタンが使える", async () => {
    const { user, onBack } = setup();
    expect(screen.getByRole("button", { name: "付箋の候補を作る" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "ボードへ戻る" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("候補が0件、または作るのに失敗したときは、理由を出す", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("話した内容（文字）"), "なし");
    await user.click(screen.getByRole("button", { name: "付箋の候補を作る" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("付箋にできる意見が見つかりませんでした");
    await user.clear(screen.getByLabelText("話した内容（文字）"));
    await user.type(screen.getByLabelText("話した内容（文字）"), "エラー");
    await user.click(screen.getByRole("button", { name: "付箋の候補を作る" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("今日の上限に達しました");
  });

  it("投稿に失敗した付箋は残し、成功したものは外す。直して、もう一度送れる", async () => {
    const { user, onPosted } = setup();
    await user.type(screen.getByLabelText("話した内容（文字）"), "あ");
    await user.click(screen.getByRole("button", { name: "付箋の候補を作る" }));
    await screen.findAllByLabelText("付箋の内容");
    await user.type(screen.getAllByLabelText("付箋の内容")[1]!, "失敗");
    await user.click(screen.getByRole("button", { name: "選んだ付箋を投稿する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("投稿に失敗しました");
    expect(onPosted).not.toHaveBeenCalled();
    const left = screen.getAllByLabelText("付箋の内容");
    expect(left).toHaveLength(1);
    expect((left[0] as HTMLTextAreaElement).value).toContain("失敗");
    await user.clear(left[0]!);
    await user.type(left[0]!, "直した");
    await user.click(screen.getByRole("button", { name: "選んだ付箋を投稿する" }));
    await waitFor(() => expect(onPosted).toHaveBeenCalledWith(1));
  });

  it("投稿を受け付けていないときは、候補も投稿もできない", async () => {
    setup({ accepting: false });
    expect(screen.getByText("現在、投稿を受け付けていません。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "付箋の候補を作る" })).toBeDisabled();
    expect(within(document.body).queryByRole("button", { name: "選んだ付箋を投稿する" })).toBeNull();
  });
});
