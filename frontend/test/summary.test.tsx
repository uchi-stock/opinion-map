import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SummaryView, type SummaryData } from "../src/components/SummaryView.tsx";
import { ViewTabs } from "../src/components/ViewTabs.tsx";
import { ParticipantPage } from "../src/pages/ParticipantPage.tsx";
import { json, opinion, SESSION, stubFetch } from "./helpers.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

const o1 = opinion("o1", "駅から遠い", "experience");
const o2 = opinion("o2", "犬は入れる？", "question");

const data = (over: Partial<SummaryData> = {}): SummaryData => ({
  overview: "アクセスの話が中心でした",
  clusters: [{ id: "c1", level: 1, title: "アクセス", summary: "行き方の話", opinionCount: 1, opinionIds: ["o1"] }],
  unclassifiedCount: 1,
  unclassifiedOpinionIds: ["o2"],
  insights: [{ clusterId: "c1", content: { commonPoints: ["遠いという点"], differences: [], premiseDifferences: [], questions: ["どう改善する？"] }, approved: true }],
  newOpinionCount: 0,
  ...over,
});

describe("SummaryView", () => {
  it("AIによる要約の注記と、概要、まとまり、未分類を出す。参加者向けと運営者向けで注記が違う", () => {
    const { rerender } = render(<SummaryView data={data()} opinions={[o1, o2]} audience="participant" />);
    expect(screen.getByRole("note")).toHaveTextContent("運営者が確認して、公開した内容です");
    expect(screen.getByText("アクセスの話が中心でした")).toBeInTheDocument();
    const cluster = screen.getByRole("region", { name: "アクセス" });
    expect(within(cluster).getByText("遠いという点")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "どこにも入らなかった意見" })).toBeInTheDocument();
    rerender(<SummaryView data={data()} opinions={[o1, o2]} audience="admin" />);
    expect(screen.getByRole("note")).toHaveTextContent("参加者に公開する前に");
    expect(screen.getByText("採用済み（参加者に公開）")).toBeInTheDocument();
  });

  it("運営者向けでは、未採用の案に、参加者に出ない旨の印を付ける", () => {
    render(
      <SummaryView
        data={data({ insights: [{ clusterId: "c1", content: { commonPoints: ["案"], differences: [], premiseDifferences: [], questions: [] }, approved: false }] })}
        opinions={[o1]}
        audience="admin"
      />,
    );
    expect(screen.getByText("未採用（参加者には出ません）")).toBeInTheDocument();
  });

  it("元の意見をたどれる。要約は原文を置き換えない", async () => {
    render(<SummaryView data={data()} opinions={[o1, o2]} audience="participant" />);
    const cluster = screen.getByRole("region", { name: "アクセス" });
    await userEvent.click(within(cluster).getByText(/元の意見を見る/));
    expect(within(cluster).getByText("駅から遠い")).toBeInTheDocument();
    const rest = screen.getByRole("region", { name: "どこにも入らなかった意見" });
    await userEvent.click(within(rest).getByText(/元の意見を見る/));
    expect(within(rest).getByText("犬は入れる？")).toBeInTheDocument();
  });

  it("元の意見のIDが無いとき(意見を見せない設定)は、たどるリンクを出さない", () => {
    render(
      <SummaryView
        data={data({ clusters: [{ id: "c1", level: 1, title: "アクセス", summary: "行き方", opinionCount: 3 }], unclassifiedOpinionIds: undefined })}
        opinions={[]}
        audience="participant"
      />,
    );
    expect(screen.queryByText(/元の意見を見る/)).toBeNull();
    expect(screen.getByText("3件")).toBeInTheDocument();
  });

  it("分析のあとに増えた投稿の数を、注意として出す", () => {
    render(<SummaryView data={data({ newOpinionCount: 2 })} opinions={[]} audience="participant" />);
    expect(screen.getByText(/2件の意見が増えています/)).toBeInTheDocument();
  });
});

describe("ViewTabs", () => {
  it("要約が無いときは、出さない。あるときは、切り替えられる", async () => {
    const { container, rerender } = render(<ViewTabs view="raw" onChange={() => {}} summaryAvailable={false} />);
    expect(container).toBeEmptyDOMElement();
    const seen: string[] = [];
    rerender(<ViewTabs view="raw" onChange={(v) => seen.push(v)} summaryAvailable />);
    expect(screen.getByRole("button", { name: "そのまま（原文）" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "要約（AI）" }));
    expect(seen).toEqual(["summary"]);
  });
});

describe("参加者の画面の、要約の見方", () => {
  const published = {
    published: true,
    overview: "公開された概要",
    newOpinionCount: 0,
    clusters: [{ id: "c1", level: 1, parentId: null, title: "公開されたまとまり", summary: "要約です", opinionCount: 1, opinionIds: ["o1"] }],
    unclassifiedCount: 0,
    insights: [],
  };

  it("公開されていなければ、「要約」の切り替えを出さない", async () => {
    stubFetch((url) => {
      if (url.endsWith("/summary")) return json({ published: false });
      if (url.endsWith("/opinions")) return json({ hidden: false, opinions: [o1] });
      return json(SESSION);
    });
    render(<ParticipantPage sessionId="s1" />);
    expect(await screen.findByText("駅から遠い")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "要約（AI）" })).toBeNull();
  });

  it("公開されていれば、切り替えて要約を見られる。「そのまま」に戻せる", async () => {
    stubFetch((url) => {
      if (url.endsWith("/summary")) return json(published);
      if (url.endsWith("/opinions")) return json({ hidden: false, opinions: [o1] });
      return json(SESSION);
    });
    const user = userEvent.setup();
    render(<ParticipantPage sessionId="s1" />);
    await screen.findByText("駅から遠い");
    await user.click(await screen.findByRole("button", { name: "要約（AI）" }));
    expect(await screen.findByTestId("summary-view")).toBeInTheDocument();
    expect(screen.getByText("公開された概要")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "意見の投稿フォーム" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "そのまま（原文）" }));
    expect(await screen.findByRole("form", { name: "意見の投稿フォーム" })).toBeInTheDocument();
  });
});

describe("運営者の画面の、要約の見方", () => {
  it("分析があれば切り替えられる。公開の切り替えは、保存される", async () => {
    const { saveAdminToken, clearAdminToken } = await import("../src/lib/adminToken.ts");
    const { AdminSessionPage } = await import("../src/pages/admin/AdminSessionPage.tsx");
    saveAdminToken("secret-token");
    const at = "2026-01-01T00:00:00.000Z";
    const calls: { method: string; path: string; body: unknown }[] = [];
    stubFetch((url, init) => {
      const path = url.replace(/^\/api/, "");
      const method = init?.method ?? "GET";
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (path === "/events") return json({ events: [{ id: "e1", name: "イベント", description: "", status: "active", createdAt: at, updatedAt: at }] });
      if (path === "/events/e1/sessions") {
        return json({ sessions: [{ id: "s1", eventId: "e1", title: "場A", prompt: "問い", format: "ost", status: "active", showOpinionsToParticipants: true, createdAt: at, updatedAt: at }] });
      }
      if (method === "PATCH" && path === "/sessions/s1") return json({});
      if (path === "/sessions/s1/opinions") return json({ hidden: false, opinions: [o1] });
      if (path === "/sessions/s1/analyses") return json({ analyses: [{ id: "a1", sessionId: "s1", status: "succeeded", requestedAt: at }] });
      if (path === "/analyses/a1") {
        return json({
          id: "a1",
          sessionId: "s1",
          status: "succeeded",
          requestedAt: at,
          providerName: "fake",
          inputCount: 1,
          newOpinionCount: 0,
          result: {
            overview: "運営者向けの概要",
            clusters: [{ id: "c1", level: 1, parentId: null, title: "アクセス", summary: "行き方", opinionIds: ["o1"] }],
            unclassifiedOpinionIds: [],
          },
        });
      }
      if (path === "/analyses/a1/insights") return json({ insights: [] });
      return json({ error: { code: "not_found", message: "なし" } }, 404);
    });
    const user = userEvent.setup();
    render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    await user.click(await screen.findByRole("button", { name: "要約（AI）" }));
    expect(await within(await screen.findByTestId("summary-view")).findByText("運営者向けの概要")).toBeInTheDocument();
    await user.click(screen.getByLabelText("この要約を参加者に公開する"));
    await vi.waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ summaryPublished: true }));
    await user.click(screen.getByRole("button", { name: "そのまま（原文）" }));
    expect(await screen.findByTestId("opinion-card")).toHaveTextContent("駅から遠い");
    expect(screen.queryByTestId("summary-view")).toBeNull();
    clearAdminToken();
  });
});
