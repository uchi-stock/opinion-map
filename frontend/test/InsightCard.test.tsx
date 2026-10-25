import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AdminApi } from "../src/api/admin.ts";
import type { Insight } from "../src/api/types.ts";
import { InsightCard } from "../src/components/admin/InsightCard.tsx";

const base: Insight = {
  id: "i1",
  analysisRunId: "r1",
  clusterId: "c1",
  providerName: "fake",
  ai: { commonPoints: ["共通A"], differences: ["違いB"], premiseDifferences: [], questions: ["問いC"] },
  approved: false,
};

const apiWith = (updateInsight: unknown) => ({ updateInsight }) as unknown as AdminApi;

describe("InsightCard", () => {
  it("AIの案であることを示し、空の欄は出さない", () => {
    render(<InsightCard api={apiWith(vi.fn())} insight={base} describeError={String} onChanged={vi.fn()} />);
    expect(screen.getByText("AIによる提案")).toBeInTheDocument();
    expect(screen.getByText("共通A")).toBeInTheDocument();
    expect(screen.queryByText("前提の違い")).toBeNull();
    expect(screen.getByText(/一致しているとは限りません/)).toBeInTheDocument();
    expect(screen.getByLabelText("議論に使う")).not.toBeChecked();
  });

  it("編集すると、編集後の内容を保存する（1行1項目、空行は除く）", async () => {
    const updateInsight = vi.fn(async (_id: string, patch: any) => ({ ...base, edited: patch.edited }));
    const onChanged = vi.fn();
    render(<InsightCard api={apiWith(updateInsight)} insight={base} describeError={String} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole("button", { name: "編集する" }));
    const questions = screen.getByLabelText(/議論の問いの案/);
    await userEvent.clear(questions);
    await userEvent.type(questions, "新しい問い{Enter}{Enter}二つ目");
    await userEvent.click(screen.getByRole("button", { name: "保存する" }));
    expect(updateInsight).toHaveBeenCalledWith("i1", {
      edited: { commonPoints: ["共通A"], differences: ["違いB"], premiseDifferences: [], questions: ["新しい問い", "二つ目"] },
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it("編集済みの内容を表示し、バッジを出す", () => {
    const edited = { commonPoints: [], differences: [], premiseDifferences: [], questions: ["編集後の問い"] };
    render(<InsightCard api={apiWith(vi.fn())} insight={{ ...base, edited }} describeError={String} onChanged={vi.fn()} />);
    expect(screen.getByText("編集後の問い")).toBeInTheDocument();
    expect(screen.queryByText("共通A")).toBeNull();
    expect(screen.getByText("編集済み")).toBeInTheDocument();
  });

  it("採用の切り替えを送る", async () => {
    const updateInsight = vi.fn(async () => ({ ...base, approved: true }));
    render(<InsightCard api={apiWith(updateInsight)} insight={base} describeError={String} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("議論に使う"));
    expect(updateInsight).toHaveBeenCalledWith("i1", { approved: true });
  });

  it("保存に失敗したら、エラーを出す", async () => {
    const updateInsight = vi.fn(async () => {
      throw new Error("失敗");
    });
    render(<InsightCard api={apiWith(updateInsight)} insight={base} describeError={(e) => (e as Error).message} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("議論に使う"));
    expect(await screen.findByRole("alert")).toHaveTextContent("失敗");
  });
});
