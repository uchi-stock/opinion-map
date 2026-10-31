import { describe, expect, it } from "vitest";
import { createAdminAuthenticator, safeEqual } from "../../core/src/lib/auth.js";

describe("文字列の比較", () => {
  it("同じ文字列だけが一致する", () => {
    expect(safeEqual("token", "token")).toBe(true);
    expect(safeEqual("token", "tokex")).toBe(false);
  });

  it("長さが違うものは、前方が同じでも一致しない", () => {
    expect(safeEqual("token", "token-extra")).toBe(false);
    expect(safeEqual("token-extra", "token")).toBe(false);
    expect(safeEqual("", "a")).toBe(false);
  });

  it("日本語など、複数バイトの文字も比較できる", () => {
    expect(safeEqual("合言葉", "合言葉")).toBe(true);
    expect(safeEqual("合言葉", "合言薬")).toBe(false);
  });
});

describe("運営者の認証", () => {
  const authenticate = createAdminAuthenticator("secret");

  it("正しいBearerトークンだけを通す", () => {
    expect(authenticate({ authorization: "Bearer secret" })).toBe(true);
    expect(authenticate({ authorization: "Bearer secret2" })).toBe(false);
    expect(authenticate({ authorization: "Bearer secre" })).toBe(false);
    expect(authenticate({ authorization: "secret" })).toBe(false);
    expect(authenticate({})).toBe(false);
  });

  it("トークンが未設定・空なら、空のBearerでも通さない", () => {
    expect(createAdminAuthenticator(undefined)({ authorization: "Bearer " })).toBe(false);
    expect(createAdminAuthenticator("")({ authorization: "Bearer " })).toBe(false);
  });
});
