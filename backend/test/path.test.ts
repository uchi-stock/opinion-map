import { describe, expect, it } from "vitest";
import { trimTrailingSlashes } from "../../core/src/lib/path.js";

describe("trimTrailingSlashes", () => {
  it("末尾の「/」をすべて取り除く。途中の「/」は残す", () => {
    expect(trimTrailingSlashes("/events/")).toBe("/events");
    expect(trimTrailingSlashes("/a/b///")).toBe("/a/b");
    expect(trimTrailingSlashes("/")).toBe("");
    expect(trimTrailingSlashes("")).toBe("");
    expect(trimTrailingSlashes("abc")).toBe("abc");
  });

  it("「/」だけが長く続く入力でも、すぐ終わる", () => {
    const start = Date.now();
    expect(trimTrailingSlashes("/".repeat(200_000) + "x/")).toBe("/".repeat(200_000) + "x");
    expect(Date.now() - start).toBeLessThan(500);
  });
});
