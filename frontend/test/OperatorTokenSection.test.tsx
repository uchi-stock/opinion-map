import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client.ts";
import type { AdminApi } from "../src/api/admin.ts";
import { AdminShell } from "../src/components/admin/AdminShell.tsx";
import { OperatorTokenSection, operatorLink } from "../src/components/admin/OperatorTokenSection.tsx";
import { loadAdminToken, clearAdminToken } from "../src/lib/adminToken.ts";

const at = "2026-01-01T00:00:00.000Z";

afterEach(() => {
  clearAdminToken();
  window.history.replaceState(null, "", "/");
});

describe("OperatorTokenSection", () => {
  it("発行したリンクを、その場で一度だけ表示し、トークンは#のあとに付ける", async () => {
    const api = {
      listOperatorTokens: vi.fn(async () => []),
      issueOperatorToken: vi.fn(async () => ({ id: "t1", eventId: "e1", label: "会場係", createdAt: at, token: "opm_abc" })),
    } as unknown as AdminApi;
    render(<OperatorTokenSection api={api} eventId="e1" describeError={String} />);
    await userEvent.type(await screen.findByLabelText(/渡す相手の名前/), "会場係");
    await userEvent.click(screen.getByRole("button", { name: "リンクを発行する" }));
    const field = (await screen.findByLabelText("渡すリンク")) as HTMLInputElement;
    expect(field.value).toBe(operatorLink("opm_abc"));
    expect(field.value).toContain("#token=opm_abc");
    expect(api.issueOperatorToken).toHaveBeenCalledWith("e1", "会場係");
  });

  it("失効できる。失効済みには、ボタンを出さない", async () => {
    const api = {
      listOperatorTokens: vi.fn(async () => [
        { id: "t1", eventId: "e1", label: "有効", createdAt: at },
        { id: "t2", eventId: "e1", label: "古い", createdAt: at, revokedAt: at },
      ]),
      revokeOperatorToken: vi.fn(async () => ({})),
    } as unknown as AdminApi;
    render(<OperatorTokenSection api={api} eventId="e1" describeError={String} />);
    expect(await screen.findByText("失効済み")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "古いのリンクを失効する" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "有効のリンクを失効する" }));
    expect(api.revokeOperatorToken).toHaveBeenCalledWith("t1");
  });

  it("権限がない運営者には、何も表示しない", async () => {
    const api = {
      listOperatorTokens: vi.fn(async () => {
        throw new ApiError(403, "owner_only", "オーナーだけ");
      }),
    } as unknown as AdminApi;
    const { container } = render(<OperatorTokenSection api={api} eventId="e1" describeError={String} />);
    await vi.waitFor(() => expect(api.listOperatorTokens).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe("共有リンクからのトークンの取り込み", () => {
  it("#token= のトークンを保存し、アドレスから消す", () => {
    window.history.replaceState(null, "", "/admin#token=opm_xyz");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    render(<AdminShell title="テスト">{() => <p>中身</p>}</AdminShell>);
    expect(screen.getByText("中身")).toBeInTheDocument();
    expect(loadAdminToken()).toBe("opm_xyz");
    expect(window.location.hash).toBe("");
  });
});
