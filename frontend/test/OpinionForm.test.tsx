import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client.ts";
import type { OpinionResult, OpinionSubmission } from "../src/api/types.ts";
import { OpinionForm } from "../src/components/OpinionForm.tsx";
import { opinion } from "./helpers.ts";

const ok = (body = "x"): OpinionResult => ({ opinion: opinion("o1", body), duplicate: false });
const SUBMISSION_ID = /^[A-Za-z0-9_-]{16,64}$/;

function setup(postOpinion = vi.fn(async () => ok()), extra: { maxLength?: number } = {}) {
  const onSubmitted = vi.fn();
  render(<OpinionForm sessionId="s1" onSubmitted={onSubmitted} postOpinion={postOpinion} {...extra} />);
  const user = userEvent.setup();
  const textbox = screen.getByRole("textbox", { name: "あなたの意見" });
  const submit = screen.getByRole("button", { name: /投稿する|送信しています/ });
  return { user, textbox, submit, postOpinion, onSubmitted };
}

describe("投稿フォーム", () => {
  it("空のときは、投稿ボタンを押せない", async () => {
    const { submit } = setup();
    expect(submit).toBeDisabled();
  });

  it("空白だけのときも、押せない", async () => {
    const { user, textbox, submit } = setup();
    await user.type(textbox, "   ");
    expect(submit).toBeDisabled();
  });

  it("入力すると、前後の空白を取り除いて送る", async () => {
    const { user, textbox, submit, postOpinion } = setup();
    await user.type(textbox, "  こんにちは  ");
    await user.click(submit);
    expect(postOpinion).toHaveBeenCalledTimes(1);
    const [sessionId, submission] = postOpinion.mock.calls[0] as unknown as [string, OpinionSubmission];
    expect(sessionId).toBe("s1");
    expect(submission).toMatchObject({ body: "こんにちは", kind: "idea" });
    expect(submission.submissionId).toMatch(SUBMISSION_ID);
  });

  it("選んだ種類を送る", async () => {
    const { user, textbox, submit, postOpinion } = setup();
    await user.click(screen.getByRole("radio", { name: "疑問" }));
    await user.type(textbox, "なぜですか");
    await user.click(submit);
    expect((postOpinion.mock.calls[0] as unknown as [string, OpinionSubmission])[1].kind).toBe("question");
  });

  it("文字数を表示し、上限を超えると押せない", async () => {
    const { user, textbox, submit } = setup(undefined, { maxLength: 5 });
    await user.type(textbox, "12345");
    expect(screen.getByText(/5 \/ 5文字/)).toBeInTheDocument();
    expect(submit).toBeEnabled();
    await user.type(textbox, "6");
    expect(screen.getByText(/文字数が多すぎます/)).toBeInTheDocument();
    expect(submit).toBeDisabled();
  });

  it("絵文字は1文字と数える", async () => {
    const { user, textbox, submit } = setup(undefined, { maxLength: 2 });
    await user.type(textbox, "😀😀");
    expect(screen.getByText(/2 \/ 2文字/)).toBeInTheDocument();
    expect(submit).toBeEnabled();
  });

  it("送信中は押せず、連打しても1回しか送らない", async () => {
    let finish!: (r: OpinionResult) => void;
    const pending = new Promise<OpinionResult>((resolve) => {
      finish = resolve;
    });
    const postOpinion = vi.fn(() => pending);
    const { user, textbox, submit } = setup(postOpinion);
    await user.type(textbox, "連打のテスト");
    await user.dblClick(submit);
    await user.click(submit);
    expect(postOpinion).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "送信しています…" })).toBeDisabled();
    finish(ok());
    await waitFor(() => expect(screen.getByRole("button", { name: "投稿する" })).toBeInTheDocument());
  });

  it("成功すると、入力を空にして知らせ、親に伝える", async () => {
    const { user, textbox, submit, onSubmitted } = setup();
    await user.type(textbox, "成功する投稿");
    await user.click(submit);
    expect(await screen.findByText(/投稿しました/)).toBeInTheDocument();
    expect(textbox).toHaveValue("");
    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });

  it("失敗すると、理由を表示し、入力を残す", async () => {
    const postOpinion = vi.fn(async () => {
      throw new ApiError(0, "network_error", "通信に失敗しました。");
    });
    const { user, textbox, submit, onSubmitted } = setup(postOpinion);
    await user.type(textbox, "失敗する投稿");
    await user.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent("通信に失敗しました。");
    expect(textbox).toHaveValue("失敗する投稿");
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("失敗後に同じ内容で再送するときは、同じ送信IDを使う（重複しないため）", async () => {
    const postOpinion = vi
      .fn<(s: string, sub: OpinionSubmission) => Promise<OpinionResult>>()
      .mockRejectedValueOnce(new ApiError(0, "network_error", "通信に失敗しました。"))
      .mockResolvedValueOnce(ok());
    const { user, textbox } = setup(postOpinion as never);
    await user.type(textbox, "再送の投稿");
    await user.click(screen.getByRole("button", { name: "投稿する" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "投稿する" }));
    await waitFor(() => expect(postOpinion).toHaveBeenCalledTimes(2));
    const ids = postOpinion.mock.calls.map((c) => c[1].submissionId);
    expect(ids[0]).toBe(ids[1]);
  });

  it("失敗後に内容を書き換えたときは、新しい送信IDを使う", async () => {
    const postOpinion = vi
      .fn<(s: string, sub: OpinionSubmission) => Promise<OpinionResult>>()
      .mockRejectedValueOnce(new ApiError(0, "network_error", "通信に失敗しました。"))
      .mockResolvedValueOnce(ok());
    const { user, textbox } = setup(postOpinion as never);
    await user.type(textbox, "最初");
    await user.click(screen.getByRole("button", { name: "投稿する" }));
    await screen.findByRole("alert");
    await user.type(textbox, "に追記");
    await user.click(screen.getByRole("button", { name: "投稿する" }));
    await waitFor(() => expect(postOpinion).toHaveBeenCalledTimes(2));
    const ids = postOpinion.mock.calls.map((c) => c[1].submissionId);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("成功後の次の投稿は、新しい送信IDを使う", async () => {
    const postOpinion = vi.fn(async (_s: string, _sub: OpinionSubmission) => ok());
    const { user, textbox } = setup(postOpinion as never);
    for (const text of ["一つ目", "二つ目"]) {
      await user.type(textbox, text);
      await user.click(screen.getByRole("button", { name: "投稿する" }));
      await screen.findByText(/投稿しました/);
    }
    const ids = postOpinion.mock.calls.map((c) => c[1].submissionId);
    expect(new Set(ids).size).toBe(2);
  });
});
