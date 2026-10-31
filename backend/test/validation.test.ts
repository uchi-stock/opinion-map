import { describe, expect, it } from "vitest";
import { charLength, parseEventCreate, parseOpinionCreate, parseSessionCreate } from "../../core/src/domain/validation.js";
import { AppError } from "../../core/src/lib/errors.js";

const valid = { body: "意見です", kind: "idea", submissionId: "submission-00000001" };

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
  return "no_error";
}

describe("投稿の入力検証", () => {
  it("正しい入力を受け付ける", () => {
    expect(parseOpinionCreate(valid)).toEqual(valid);
  });

  it("前後の空白を取り除く", () => {
    expect(parseOpinionCreate({ ...valid, body: "  こんにちは \n" }).body).toBe("こんにちは");
  });

  it("空文字を拒否する", () => {
    expect(codeOf(() => parseOpinionCreate({ ...valid, body: "" }))).toBe("required");
  });

  it("空白だけの投稿を拒否する", () => {
    expect(codeOf(() => parseOpinionCreate({ ...valid, body: " \n\t　" }))).toBe("required");
  });

  it("本文がないと拒否する", () => {
    const { body: _omit, ...rest } = valid;
    expect(codeOf(() => parseOpinionCreate(rest))).toBe("required");
  });

  it("文字列以外を拒否する", () => {
    expect(codeOf(() => parseOpinionCreate({ ...valid, body: 123 }))).toBe("invalid_type");
  });

  it("上限ちょうどは受け付け、超えると拒否する", () => {
    expect(parseOpinionCreate({ ...valid, body: "あ".repeat(300) }).body).toHaveLength(300);
    expect(codeOf(() => parseOpinionCreate({ ...valid, body: "あ".repeat(301) }))).toBe("too_long");
  });

  it("上限は設定で変えられる", () => {
    expect(codeOf(() => parseOpinionCreate({ ...valid, body: "あいう" }, 2))).toBe("too_long");
  });

  it("絵文字などのサロゲートペアは1文字と数える", () => {
    expect(charLength("😀😀")).toBe(2);
    expect(parseOpinionCreate({ ...valid, body: "😀".repeat(300) }).body).toBeTruthy();
    expect(codeOf(() => parseOpinionCreate({ ...valid, body: "😀".repeat(301) }))).toBe("too_long");
  });

  it("改行とタブは許し、その他の制御文字は拒否する", () => {
    expect(parseOpinionCreate({ ...valid, body: "一行目\n二行目\tタブ" }).body).toContain("\n");
    expect(codeOf(() => parseOpinionCreate({ ...valid, body: "あ\u0000い" }))).toBe("invalid_characters");
    expect(codeOf(() => parseOpinionCreate({ ...valid, body: "あ\u001bい" }))).toBe("invalid_characters");
  });

  it("種類が正しくないと拒否する", () => {
    expect(codeOf(() => parseOpinionCreate({ ...valid, kind: "rant" }))).toBe("invalid_value");
    expect(codeOf(() => parseOpinionCreate({ ...valid, kind: undefined }))).toBe("required");
  });

  it("送信IDの形式を確認する", () => {
    expect(codeOf(() => parseOpinionCreate({ ...valid, submissionId: "short" }))).toBe("invalid_submission_id");
    expect(codeOf(() => parseOpinionCreate({ ...valid, submissionId: "a b c d e f g h i j k l" }))).toBe(
      "invalid_submission_id",
    );
    expect(codeOf(() => parseOpinionCreate({ ...valid, submissionId: undefined }))).toBe("invalid_submission_id");
  });

  it("JSONオブジェクト以外の本文を拒否する", () => {
    expect(codeOf(() => parseOpinionCreate(null))).toBe("invalid_body");
    expect(codeOf(() => parseOpinionCreate([]))).toBe("invalid_body");
    expect(codeOf(() => parseOpinionCreate("text"))).toBe("invalid_body");
  });
});

describe("イベントとテーマの入力検証", () => {
  it("イベント名は必須", () => {
    expect(codeOf(() => parseEventCreate({ name: "  " }))).toBe("required");
    expect(parseEventCreate({ name: "カンファレンス" })).toEqual({ name: "カンファレンス", description: "" });
  });

  it("テーマの形式は省略するとワークショップになる", () => {
    const s = parseSessionCreate({ title: "A", prompt: "問い" });
    expect(s.format).toBe("workshop");
    expect(s.showOpinionsToParticipants).toBe(true);
  });

  it("テーマの形式が正しくないと拒否する", () => {
    expect(codeOf(() => parseSessionCreate({ title: "A", prompt: "問い", format: "party" }))).toBe("invalid_value");
  });
});
