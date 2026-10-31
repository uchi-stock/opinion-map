import type { NotesEntry } from "../api/types.ts";

/**
 * 全テーマの記録を、Markdown にする(結果の持ち帰り用)。
 * 担当者は名前の文字列だけ。見出しや記号が崩れないよう、改行は1つの空白にする。
 */
export function notesToMarkdown(eventName: string, entries: NotesEntry[]): string {
  const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();
  const lines: string[] = [`# ${oneLine(eventName)}`, ""];
  for (const entry of entries) {
    lines.push(`## ${oneLine(entry.title)}`, "");
    lines.push("### 結論", "", entry.notes.conclusion.trim() || "（未記入）", "");
    lines.push("### 次の行動", "");
    if (entry.notes.nextActions.length === 0) lines.push("（なし）");
    for (const a of entry.notes.nextActions) {
      lines.push(`- ${oneLine(a.text)}${a.owner ? `（担当: ${oneLine(a.owner)}）` : ""}`);
    }
    lines.push("", "### 未解決の問い", "");
    if (entry.notes.openQuestions.length === 0) lines.push("（なし）");
    for (const q of entry.notes.openQuestions) lines.push(`- ${oneLine(q)}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
