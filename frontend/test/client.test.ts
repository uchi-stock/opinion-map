import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getSession, listOpinions, postOpinion } from "../src/api/client.ts";
import { json, SESSION, stubFetch } from "./helpers.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("APIクライアント", () => {
  it("テーマを取得する", async () => {
    const fetchMock = stubFetch(() => json(SESSION));
    expect((await getSession("s1")).title).toBe(SESSION.title);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/sessions/s1");
  });

  it("IDをURLエンコードする", async () => {
    const fetchMock = stubFetch(() => json({ hidden: false, opinions: [] }));
    await listOpinions("a/b c");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/sessions/a%2Fb%20c/opinions");
  });

  it("投稿はJSONで送る", async () => {
    const fetchMock = stubFetch(() => json({ opinion: {}, duplicate: false }, 201));
    await postOpinion("s1", { body: "本文", kind: "idea", submissionId: "submission-00000001" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      body: "本文",
      kind: "idea",
      submissionId: "submission-00000001",
    });
  });

  it("エラー応答の内容を、ApiErrorにする", async () => {
    stubFetch(() => json({ error: { code: "too_long", message: "300文字以内で入力してください" } }, 400));
    const error = await postOpinion("s1", { body: "x", kind: "idea", submissionId: "submission-00000001" }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: "too_long", message: "300文字以内で入力してください" });
  });

  it("本文がJSONでないエラーでも、ApiErrorにする", async () => {
    stubFetch(() => new Response("<html>bad gateway</html>", { status: 502 }));
    const error = await getSession("s1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: "unknown_error" });
  });

  it("通信に失敗したら、network_error にする", async () => {
    stubFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    const error = await getSession("s1").catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0, code: "network_error" });
  });
});
