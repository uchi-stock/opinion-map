import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "../src/api/types.ts";
import { StickyBoard, ViewToggle } from "../src/components/StickyBoard.tsx";
import { groupByClusters, groupByKind, noteTilt } from "../src/lib/board.ts";
import { opinion } from "./helpers.ts";

const o1 = { ...opinion("o1", "駅から遠い", "experience"), reactionCount: 3 };
const o2 = opinion("o2", "予約はどうする？", "question");
const o3 = opinion("o3", "送迎バスを出す", "idea");
const o4 = opinion("o4", "犬は入れる？", "question");

const result: AnalysisResult = {
  overview: "",
  clusters: [
    { id: "c1", level: 1, parentId: null, title: "アクセス", summary: "行き方の話", opinionIds: ["o1", "o3"] },
    { id: "c2", level: 2, parentId: "c1", title: "細かい話", summary: "", opinionIds: ["o1"] },
  ],
  unclassifiedOpinionIds: ["o4"],
};

describe("ボードのまとめ方", () => {
  it("種類ごとにまとめる。空の種類は出さない", () => {
    const groups = groupByKind([o1, o2, o3]);
    expect(groups.map((g) => [g.title, g.opinions.length])).toEqual([["経験", 1], ["疑問", 1], ["アイデア", 1]]);
    expect(groupByKind([o1]).map((g) => g.title)).toEqual(["経験"]);
  });

  it("クラスタごとにまとめ、どこにも入らない意見と、分析のあとの投稿も落とさない", () => {
    const groups = groupByClusters([o1, o2, o3, o4], result);
    expect(groups.map((g) => g.title)).toEqual(["アクセス", "どこにも入らなかった意見", "分析のあとの新しい投稿"]);
    expect(groups[0]!.opinions.map((o) => o.id)).toEqual(["o1", "o3"]);
    expect(groups[1]!.unclassified).toBe(true);
    expect(groups[2]!.opinions.map((o) => o.id)).toEqual(["o2"]);
    // すべての投稿が、ちょうど1か所に置かれる
    expect(groups.flatMap((g) => g.opinions).length).toBe(4);
  });

  it("付箋の傾きは、IDから決まり、-2〜2度に収まる", () => {
    expect(noteTilt("abc")).toBe(noteTilt("abc"));
    for (const id of ["a", "b", "c", "dddd", "o1"]) expect(Math.abs(noteTilt(id))).toBeLessThanOrEqual(2);
  });
});

describe("StickyBoard", () => {
  it("まとまりごとに付箋を並べ、種類とラベルと票数を表示する", () => {
    render(<StickyBoard groups={groupByClusters([o1, o2, o3, o4], result)} />);
    const access = screen.getByRole("region", { name: "アクセス" });
    expect(within(access).getAllByTestId("sticky-note")).toHaveLength(2);
    expect(within(access).getByText("いいね 3")).toBeInTheDocument();
    expect(within(access).getByText("経験")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "どこにも入らなかった意見" })).toBeInTheDocument();
    expect(screen.getByText(/少数の意見として、そのまま残しています/)).toBeInTheDocument();
  });

  it("付箋が1つもなければ、案内を出す", () => {
    render(<StickyBoard groups={[]} />);
    expect(screen.getByText("まだ付箋はありません。")).toBeInTheDocument();
  });

  it("一覧とボードを切り替えられる", async () => {
    const seen: string[] = [];
    render(<ViewToggle mode="list" onChange={(m) => seen.push(m)} />);
    expect(screen.getByRole("button", { name: "一覧" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "ボード" }));
    expect(seen).toEqual(["board"]);
  });
});
