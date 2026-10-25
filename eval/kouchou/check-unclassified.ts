/**
 * 広聴AIの実際の出力を、本アプリのアダプターと検証にかけ、未分類の投稿が算出されることを確かめる。
 * 使い方: npx tsx check-unclassified.ts <hierarchical_result.json> <入力CSV>
 * 未分類の件数は、LLMの出力によって変わる。ここでは件数を固定せず、結果をそのまま報告する。
 */
import { readFileSync } from "node:fs";
import { parseKouchouResult } from "../../backend/src/adapters/kouchouAi.ts";
import { validateResult } from "../../backend/src/analysis/validation.ts";

const [resultPath, csvPath] = process.argv.slice(2);
if (!resultPath || !csvPath) {
  console.error("使い方: check-unclassified.ts <hierarchical_result.json> <入力CSV>");
  process.exit(2);
}

// 入力CSV（先頭が id,body の2列。本文に改行を含まない前提）
const lines = readFileSync(csvPath, "utf8").split(/\r?\n/).slice(1).filter((l) => l.trim() !== "");
const inputIds = lines.map((l) => l.slice(0, l.indexOf(",")));
const bodies = new Map(lines.map((l) => [l.slice(0, l.indexOf(",")), l.slice(l.indexOf(",") + 1)]));

const result = validateResult(parseKouchouResult(JSON.parse(readFileSync(resultPath, "utf8"))), inputIds);
const classified = new Set(result.clusters.flatMap((c) => c.opinionIds));

console.log("## 未分類の確認（アプリ側の算出）");
console.log();
console.log(`- 入力: ${inputIds.length}件`);
console.log(`- クラスタに入った投稿: ${classified.size}件`);
console.log(`- 未分類: ${result.unclassifiedOpinionIds.length}件`);
console.log();
for (const id of result.unclassifiedOpinionIds) {
  console.log(`- ${id}: ${bodies.get(id) ?? ""}`);
}

// 入力のすべてが、クラスタか未分類のどちらかに必ず入っていること
if (classified.size + result.unclassifiedOpinionIds.length !== inputIds.length) {
  console.error("::error::クラスタと未分類の合計が、入力の件数と合いません。");
  process.exit(1);
}
