import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MyOpinionActions } from "../src/components/MyOpinionActions.tsx";
import { forgetMyOpinion, loadMyOpinions, newEditKey, rememberMyOpinion } from "../src/lib/myOpinions.ts";
import { json, opinion, stubFetch } from "./helpers.ts";

const KEY = "k".repeat(22);

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("MyOpinionActions", () => {
  it("編集すると、鍵を付けて送り、更新後の投稿を渡す", async () => {
    const mock = stubFetch(() => json({ opinion: opinion("o1", "直した意見") }));
    const onEdited = vi.fn();
    render(<MyOpinionActions opinion={opinion("o1", "元の意見")} editKey={KEY} canEdit onEdited={onEdited} onDeleted={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "編集する" }));
    const box = screen.getByLabelText("意見を直す");
    await userEvent.clear(box);
    await userEvent.type(box, "直した意見");
    await userEvent.click(screen.getByRole("button", { name: "保存する" }));
    const [url, init] = mock.mock.calls[0]!;
    expect(String(url)).toContain("/opinions/o1");
    expect((init as RequestInit).method).toBe("PATCH");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ editKey: KEY, body: "直した意見" });
    expect(onEdited).toHaveBeenCalledWith(expect.objectContaining({ body: "直した意見" }));
  });

  it("空の本文や文字数超過では保存できない", async () => {
    stubFetch(() => json({}));
    render(<MyOpinionActions opinion={opinion("o1", "元")} editKey={KEY} maxLength={5} canEdit onEdited={vi.fn()} onDeleted={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "編集する" }));
    const box = screen.getByLabelText("意見を直す");
    await userEvent.clear(box);
    expect(screen.getByRole("button", { name: "保存する" })).toBeDisabled();
    await userEvent.type(box, "123456");
    expect(screen.getByRole("button", { name: "保存する" })).toBeDisabled();
  });

  it("削除は、確認のあとにだけ実行する", async () => {
    const mock = stubFetch(() => json({ deleted: true }));
    const onDeleted = vi.fn();
    render(<MyOpinionActions opinion={opinion("o1", "消す")} editKey={KEY} canEdit onEdited={vi.fn()} onDeleted={onDeleted} />);
    await userEvent.click(screen.getByRole("button", { name: "削除する" }));
    expect(mock).not.toHaveBeenCalled();
    expect(screen.getByText(/元に戻せません/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "削除する" }));
    expect(String(mock.mock.calls[0]![0])).toContain("/opinions/o1/delete");
    expect(onDeleted).toHaveBeenCalledWith("o1");
  });

  it("失敗したら、理由を出す", async () => {
    stubFetch(() => json({ error: { code: "invalid_edit_key", message: "鍵が合いません" } }, 403));
    render(<MyOpinionActions opinion={opinion("o1", "x")} editKey={KEY} canEdit onEdited={vi.fn()} onDeleted={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "削除する" }));
    await userEvent.click(screen.getByRole("button", { name: "削除する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("鍵が合いません");
  });
});

describe("自分の投稿の鍵の保存", () => {
  it("保存・取り出し・削除ができる", () => {
    rememberMyOpinion("a", "ka");
    rememberMyOpinion("b", "kb");
    expect(loadMyOpinions()).toEqual({ a: "ka", b: "kb" });
    forgetMyOpinion("a");
    expect(loadMyOpinions()).toEqual({ b: "kb" });
  });

  it("壊れた内容や、保存できない環境でも、例外を投げない", () => {
    window.localStorage.setItem("opinion-map-my-opinions", "{壊れている");
    expect(loadMyOpinions()).toEqual({});
    window.localStorage.setItem("opinion-map-my-opinions", "[1,2]");
    expect(loadMyOpinions()).toEqual({});
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => rememberMyOpinion("a", "k")).not.toThrow();
    spy.mockRestore();
  });

  it("鍵は十分に長く、毎回違う", () => {
    const a = newEditKey();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22,128}$/);
    expect(newEditKey()).not.toBe(a);
  });
});
