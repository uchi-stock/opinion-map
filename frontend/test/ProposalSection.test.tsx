import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProposalSection } from "../src/components/ProposalSection.tsx";
import { json, stubFetch } from "./helpers.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const at = "2026-01-01T00:00:00.000Z";

describe("ProposalSection", () => {
  it("受け付けていて、提案が無いなら、フォームだけを出す。提案すると送信される", async () => {
    let proposals: unknown[] = [];
    const mock = stubFetch((url, init) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        proposals = [{ id: "p1", title: body.title, description: body.description, status: "pending", reactionCount: 0, createdAt: at }];
        return json({ proposal: proposals[0], duplicate: false }, 201);
      }
      return json({ accepting: true, proposals });
    });
    const user = userEvent.setup();
    render(<ProposalSection eventId="e1" />);
    await user.type(await screen.findByLabelText(/話したい議題/), "朝のふりかえり");
    await user.click(screen.getByRole("button", { name: "議題を提案する" }));
    expect(await screen.findByText("提案しました。運営者が確認します。")).toBeInTheDocument();
    expect(await screen.findByText("朝のふりかえり")).toBeInTheDocument();
    const post = mock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    const sent = JSON.parse(String((post![1] as RequestInit).body));
    expect(sent.submissionId.length).toBeGreaterThanOrEqual(16);
    expect(Object.keys(sent).sort()).toEqual(["description", "submissionId", "title"]);
  });

  it("議題が空だと、送れない", async () => {
    stubFetch(() => json({ accepting: true, proposals: [] }));
    render(<ProposalSection eventId="e1" />);
    expect(await screen.findByRole("button", { name: "議題を提案する" })).toBeDisabled();
  });

  it("受け付けていなくて、提案も無いなら、何も出さない", async () => {
    stubFetch(() => json({ accepting: false, proposals: [] }));
    const { container } = render(<ProposalSection eventId="e1" />);
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("承認されて、テーマになった提案から、そのテーマを開ける。いいねも付けられる", async () => {
    stubFetch(() =>
      json({
        accepting: false,
        proposals: [{ id: "p1", title: "午後の議題", description: "", status: "approved", sessionId: "s9", reactionCount: 4, createdAt: at }],
      }),
    );
    const opened: string[] = [];
    const user = userEvent.setup();
    render(<ProposalSection eventId="e1" onOpenSession={(id) => opened.push(id)} />);
    expect(await screen.findByText("テーマになりました")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "いいね 4" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "このテーマを開く" }));
    expect(opened).toEqual(["s9"]);
  });
});
