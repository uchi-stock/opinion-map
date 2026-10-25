import { describe, expect, it } from "vitest";
import { toHttpApiResult, toHttpRequest } from "../src/lambdaAdapter.js";

describe("Lambda アダプター", () => {
  it("ヘッダーを小文字にそろえる", () => {
    const req = toHttpRequest({
      rawPath: "/events",
      headers: { Authorization: "Bearer x", "Content-Type": "application/json" },
      body: "{}",
      requestContext: { http: { method: "POST" } },
    });
    expect(req).toEqual({
      method: "POST",
      path: "/events",
      headers: { authorization: "Bearer x", "content-type": "application/json" },
      body: "{}",
    });
  });

  it("base64 の本文を復号する", () => {
    const req = toHttpRequest({
      rawPath: "/x",
      body: Buffer.from('{"a":"あ"}', "utf8").toString("base64"),
      isBase64Encoded: true,
      requestContext: { http: { method: "POST" } },
    });
    expect(req.body).toBe('{"a":"あ"}');
  });

  it("本文がなければ、body を持たない", () => {
    const req = toHttpRequest({ rawPath: "/x", requestContext: { http: { method: "GET" } } });
    expect("body" in req).toBe(false);
  });

  it("応答を API Gateway の形に変換する", () => {
    expect(toHttpApiResult({ statusCode: 201, headers: { a: "b" }, body: "{}" })).toEqual({
      statusCode: 201,
      headers: { a: "b" },
      body: "{}",
    });
  });
});
