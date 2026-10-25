import { afterEach, describe, expect, it, vi } from "vitest";
import { newSubmissionId } from "../src/lib/submissionId.ts";

const FORMAT = /^[A-Za-z0-9_-]{16,64}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("送信ID", () => {
  it("バックエンドの形式を満たし、毎回違う", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newSubmissionId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(FORMAT);
  });

  it("randomUUID が無い環境でも作れる（古いiOS Safariなどを想定）", () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => crypto_fill(a) });
    expect(newSubmissionId()).toMatch(FORMAT);
  });

  it("crypto 自体が無い環境でも、例外を投げずに作れる", () => {
    vi.stubGlobal("crypto", undefined);
    expect(newSubmissionId()).toMatch(FORMAT);
  });
});

function crypto_fill(a: Uint8Array): Uint8Array {
  for (let i = 0; i < a.length; i++) a[i] = (i * 17 + 3) % 256;
  return a;
}
