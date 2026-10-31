import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client.ts";
import type { AdminApi } from "../src/api/admin.ts";
import { AdminListSection } from "../src/components/admin/AdminListSection.tsx";

const at = "2026-01-01T00:00:00.000Z";

describe("AdminListSection", () => {
  it("管理者を追加できる", async () => {
    const api = {
      listAdmins: vi.fn(async () => [{ email: "a@example.com", addedAt: at, addedBy: "(seed)" }]),
      addAdmin: vi.fn(async () => ({ email: "b@example.com", addedAt: at, addedBy: "a@example.com" })),
    } as unknown as AdminApi;
    render(<AdminListSection api={api} describeError={String} />);
    await userEvent.type(await screen.findByLabelText(/追加するGoogleアカウント/), "b@example.com");
    await userEvent.click(screen.getByRole("button", { name: "管理者に追加する" }));
    expect(api.addAdmin).toHaveBeenCalledWith("b@example.com");
  });

  it("外せる。1人だけのときは、外すボタンを押せない", async () => {
    const two = [
      { email: "a@example.com", addedAt: at, addedBy: "(seed)" },
      { email: "b@example.com", addedAt: at, addedBy: "a@example.com" },
    ];
    const api = { listAdmins: vi.fn(async () => two), removeAdmin: vi.fn(async () => {}) } as unknown as AdminApi;
    const { unmount } = render(<AdminListSection api={api} describeError={String} />);
    await userEvent.click(await screen.findByRole("button", { name: "b@example.comを管理者から外す" }));
    expect(api.removeAdmin).toHaveBeenCalledWith("b@example.com");
    unmount();

    const one = { listAdmins: vi.fn(async () => [two[0]]) } as unknown as AdminApi;
    render(<AdminListSection api={one} describeError={String} />);
    expect(await screen.findByRole("button", { name: "a@example.comを管理者から外す" })).toBeDisabled();
  });

  it("権限がない運営者には、何も表示しない", async () => {
    const api = {
      listAdmins: vi.fn(async () => {
        throw new ApiError(403, "owner_only", "オーナーだけ");
      }),
    } as unknown as AdminApi;
    const { container } = render(<AdminListSection api={api} describeError={String} />);
    await vi.waitFor(() => expect(api.listAdmins).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
