import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AdminApi } from "../src/api/admin.ts";
import { UsageSection } from "../src/components/admin/UsageSection.tsx";

const summary = (analysisUsed: number) => ({
  day: "2026-01-01",
  resetsAt: "2026-01-01T15:00:00.000Z",
  analysis: { used: analysisUsed, limit: 10 },
  insight: { used: 3, limit: 100 },
});

describe("UsageSection", () => {
  it("今日の使用量と上限、戻る時刻(日本時間)を出す", async () => {
    const api = { getUsage: vi.fn(async () => summary(4)) } as unknown as AdminApi;
    render(<UsageSection api={api} eventId="e1" describeError={String} />);
    expect(await screen.findByText("4 / 10回")).toBeInTheDocument();
    expect(screen.getByText("3 / 100回")).toBeInTheDocument();
    expect(screen.getByText(/0:00（日本時間）に戻ります/)).toBeInTheDocument();
  });

  it("上限に達したら、上限と分かる表示を出す", async () => {
    const api = { getUsage: vi.fn(async () => summary(10)) } as unknown as AdminApi;
    render(<UsageSection api={api} eventId="e1" describeError={String} />);
    expect(await screen.findByText("10 / 10回（上限）")).toBeInTheDocument();
  });

  it("読み込めなければ、何も出さない", async () => {
    const api = { getUsage: vi.fn(async () => { throw new Error("x"); }) } as unknown as AdminApi;
    const { container } = render(<UsageSection api={api} eventId="e1" describeError={String} />);
    await vi.waitFor(() => expect(api.getUsage).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
