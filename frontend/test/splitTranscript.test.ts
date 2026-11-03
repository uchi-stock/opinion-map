import { describe, expect, it } from "vitest";
import { splitTranscript } from "../src/lib/splitTranscript.ts";

describe("splitTranscript", () => {
  it("上限に収まるなら、1つの塊にする。空は作らない", () => {
    expect(splitTranscript("あ\nい")).toEqual(["あ\nい"]);
    expect(splitTranscript("")).toEqual([]);
    expect(splitTranscript("  \n \n")).toEqual([]);
  });

  it("上限を超えるときは、改行で区切って分ける", () => {
    expect(splitTranscript("ああああ\nいいいい\nうううう", 9)).toEqual(["ああああ\nいいいい", "うううう"]);
  });

  it("1行が上限より長いときは、上限で切る。どの塊も上限以下", () => {
    const chunks = splitTranscript("あ".repeat(25), 10);
    expect(chunks.map((c) => [...c].length)).toEqual([10, 10, 5]);
    for (const chunk of splitTranscript("あ".repeat(9000) + "\n" + "い".repeat(100))) expect([...chunk].length).toBeLessThanOrEqual(4000);
  });
});
