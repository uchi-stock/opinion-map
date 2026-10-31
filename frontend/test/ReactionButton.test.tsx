import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactionButton } from "../src/components/ReactionButton.tsx";
import { json } from "./helpers.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("ReactionButton", () => {
  it("押すと付き、数が更新される。もう一度押すと外れる", async () => {
    let reacted = false;
    const calls: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        calls.push(body);
        reacted = body.reacted;
        return json({ reacted, count: reacted ? 1 : 0 });
      }),
    );
    const onChanged = vi.fn();
    render(<ReactionButton opinionId="o1" count={0} disabled={false} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole("button", { name: "いいね 0" }));
    expect(await screen.findByRole("button", { name: "いいね済み 0" })).toHaveAttribute("aria-pressed", "true");
    expect(onChanged).toHaveBeenCalledWith(1);
    expect((calls[0] as { voterId: string }).voterId.length).toBeGreaterThanOrEqual(22);
    await userEvent.click(screen.getByRole("button", { name: "いいね済み 0" }));
    await vi.waitFor(() => expect(onChanged).toHaveBeenLastCalledWith(0));
    expect((calls[1] as { reacted: boolean }).reacted).toBe(false);
  });

  it("受け付けを終えたら、押せない", () => {
    render(<ReactionButton opinionId="o1" count={3} disabled onChanged={() => {}} />);
    expect(screen.getByRole("button", { name: "いいね 3" })).toBeDisabled();
  });
});
