import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OpinionCard } from "../src/components/OpinionCard.tsx";
import { opinion } from "./helpers.ts";

describe("意見のカード", () => {
  it("本文と、種類のラベルを表示する", () => {
    render(<OpinionCard opinion={opinion("o1", "意見の本文", "question")} />);
    expect(screen.getByText("意見の本文")).toBeInTheDocument();
    expect(screen.getByText("疑問")).toBeInTheDocument();
  });

  it("HTMLやスクリプトは、文字としてそのまま表示し、実行しない", () => {
    const evil = `<img src=x onerror="alert(1)"><script>alert(2)</script><b>太字</b>`;
    const { container } = render(<OpinionCard opinion={opinion("o1", evil)} />);
    expect(screen.getByText(evil)).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("改行を保って表示する", () => {
    render(<OpinionCard opinion={opinion("o1", "一行目\n二行目")} />);
    const text = screen.getByText(/一行目/);
    expect(text).toHaveStyle({ whiteSpace: "pre-wrap" });
  });
});
