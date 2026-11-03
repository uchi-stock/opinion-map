import { describe, expect, it } from "vitest";
import { basePath, stripBase, trimTrailingSlashes, withBase } from "../src/lib/paths.ts";

describe("基準パス", () => {
  it("基準パスが / のときは、何も変えない", () => {
    expect(basePath("/")).toBe("");
    expect(withBase("/admin", "/")).toBe("/admin");
    expect(stripBase("/s/abc", "/")).toBe("/s/abc");
  });

  it("サイトの途中のパスから配信するときは、足し引きする", () => {
    expect(basePath("/opinion-map/")).toBe("/opinion-map");
    expect(withBase("/admin", "/opinion-map/")).toBe("/opinion-map/admin");
    expect(stripBase("/opinion-map/s/abc", "/opinion-map/")).toBe("/s/abc");
    expect(stripBase("/opinion-map/", "/opinion-map/")).toBe("/");
    expect(stripBase("/opinion-map", "/opinion-map/")).toBe("/");
  });

  it("基準パスで始まらないパスや、似た名前のパスは、そのままにする", () => {
    expect(stripBase("/other/s/abc", "/opinion-map/")).toBe("/other/s/abc");
    expect(stripBase("/opinion-map-2/s/abc", "/opinion-map/")).toBe("/opinion-map-2/s/abc");
  });
});

describe("trimTrailingSlashes", () => {
  it("末尾の「/」をすべて取り除く。途中の「/」は残す", () => {
    expect(trimTrailingSlashes("/api/")).toBe("/api");
    expect(trimTrailingSlashes("/a/b///")).toBe("/a/b");
    expect(trimTrailingSlashes("/")).toBe("");
    expect(trimTrailingSlashes("abc")).toBe("abc");
  });
});
