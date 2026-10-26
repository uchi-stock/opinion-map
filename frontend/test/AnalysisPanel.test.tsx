import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client.ts";
import type { AdminApi } from "../src/api/admin.ts";
import type { AnalysisRun } from "../src/api/types.ts";
import { AnalysisPanel, AnalysisResultView } from "../src/components/admin/AnalysisPanel.tsx";
import { opinion } from "./helpers.ts";

const opinions = [opinion("o1", "意見A"), opinion("o2", "意見B"), opinion("o3", "<b>少数の意見</b>", "question")];

const run = (over: Partial<AnalysisRun> = {}): AnalysisRun => ({
  id: "r1",
  sessionId: "s1",
  status: "succeeded",
  requestedAt: "2026-01-01T00:00:00.000Z",
  providerName: "fake",
  inputCount: 3,
  newOpinionCount: 0,
  result: {
    overview: "概要です",
    clusters: [{ id: "c1", level: 1, parentId: null, title: "まとまり1", summary: "要約", opinionIds: ["o1", "o2"] }],
    unclassifiedOpinionIds: ["o3"],
  },
  ...over,
});

describe("AnalysisResultView", () => {
  it("クラスタと、未分類を同じ重みで表示する", () => {
    render(<AnalysisResultView run={run()} opinions={opinions} />);
    const cluster = screen.getByRole("region", { name: "まとまり1" });
    const unclassified = screen.getByRole("region", { name: "未分類" });
    expect(within(cluster).getByText("意見A")).toBeInTheDocument();
    expect(within(unclassified).getByText("<b>少数の意見</b>")).toBeInTheDocument();
    expect(unclassified.className).toContain("card");
    expect(within(unclassified).getByRole("link", { name: "元の投稿" })).toHaveAttribute("href", "#opinion-o3");
  });

  it("未分類がなければ、未分類の欄を出さない", () => {
    const r = run();
    r.result!.unclassifiedOpinionIds = [];
    render(<AnalysisResultView run={r} opinions={opinions} />);
    expect(screen.queryByRole("region", { name: "未分類" })).toBeNull();
  });
});

function fakeApi(over: Partial<Record<keyof AdminApi, unknown>>) {
  return { listAnalyses: vi.fn(async () => []), listInsights: vi.fn(async () => []), getAnalysis: vi.fn(), startAnalysis: vi.fn(), retryAnalysis: vi.fn(), ...over } as unknown as AdminApi;
}

describe("AnalysisPanel", () => {
  it("分析を始めて、結果を表示する", async () => {
    const done = run();
    const api = fakeApi({
      listAnalyses: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([done]),
      startAnalysis: vi.fn(async () => ({ ...done, status: "running", result: undefined })),
      getAnalysis: vi.fn(async () => done),
    });
    render(<AnalysisPanel api={api} sessionId="s1" opinions={opinions} describeError={String} />);
    await userEvent.click(await screen.findByRole("button", { name: "分析する" }));
    expect(await screen.findByRole("region", { name: "未分類" })).toBeInTheDocument();
  });

  it("失敗したら、理由と再実行のボタンを出す", async () => {
    const failed = run({ status: "failed", result: undefined, error: { code: "x", summary: "原因です" } });
    const api = fakeApi({
      listAnalyses: vi.fn(async () => [failed]),
      getAnalysis: vi.fn(async () => failed),
      retryAnalysis: vi.fn(async () => run()),
    });
    render(<AnalysisPanel api={api} sessionId="s1" opinions={opinions} describeError={String} />);
    expect(await screen.findByText(/原因です/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "再実行する" }));
    expect(api.retryAnalysis).toHaveBeenCalledWith("r1");
  });

  it("投稿がなければ、分析を始められない", async () => {
    render(<AnalysisPanel api={fakeApi({})} sessionId="s1" opinions={[]} describeError={String} />);
    expect(await screen.findByRole("button", { name: "分析する" })).toBeDisabled();
  });

  it("クラスタごとに案を作れる。案を作るAIが未設定なら、ボタンを出さない", async () => {
    const done = run();
    const created = {
      id: "i1",
      analysisRunId: "r1",
      clusterId: "c1",
      providerName: "fake",
      ai: { commonPoints: ["共通A"], differences: [], premiseDifferences: [], questions: ["問いC"] },
      approved: false,
    };
    const api = fakeApi({
      listAnalyses: vi.fn(async () => [done]),
      getAnalysis: vi.fn(async () => done),
      generateInsight: vi.fn(async () => created),
    });
    render(<AnalysisPanel api={api} sessionId="s1" opinions={opinions} describeError={String} />);
    await userEvent.click(await screen.findByRole("button", { name: /共通点・相違点を考える/ }));
    expect(await screen.findByText("共通A")).toBeInTheDocument();
    expect(api.generateInsight).toHaveBeenCalledWith("r1", "c1");
  });

  it("案のAPIが503なら、案を作るボタンを出さない", async () => {
    const done = run();
    const api = fakeApi({
      listAnalyses: vi.fn(async () => [done]),
      getAnalysis: vi.fn(async () => done),
      listInsights: vi.fn(async () => {
        throw new ApiError(503, "insights_unavailable", "未設定");
      }),
    });
    render(<AnalysisPanel api={api} sessionId="s1" opinions={opinions} describeError={String} />);
    expect(await screen.findByRole("region", { name: "まとまり1" })).toBeInTheDocument();
    // 503 の応答が反映されると、ボタンが消える
    await vi.waitFor(() => expect(screen.queryByRole("button", { name: /共通点・相違点を考える/ })).toBeNull());
    expect(api.listInsights).toHaveBeenCalled();
  });

  it("分析中は、待ち時間の目安を出す", async () => {
    const running = run({ status: "running", result: undefined });
    const api = fakeApi({
      listAnalyses: vi.fn(async () => [running]),
      getAnalysis: vi.fn(async () => running),
    });
    render(<AnalysisPanel api={api} sessionId="s1" opinions={opinions} describeError={String} />);
    expect(await screen.findByText(/数分かかります/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /分析する/ })).toBeDisabled();
  });
});
