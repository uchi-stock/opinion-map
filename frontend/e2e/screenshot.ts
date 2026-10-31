import fs from "node:fs";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";

// CI(reusable-ci)が、このディレクトリの PNG を PR のコメントと Job Summary に画像で埋め込む。
// スマホで見るため、Playwright の HTML レポートではなく、これを使う
const DIR = path.resolve(process.cwd(), "e2e-screenshots");

export async function captureScreenshot(page: Page, testInfo: TestInfo, name: string, caption: string): Promise<void> {
  const body = await page.screenshot({ fullPage: true });
  await testInfo.attach(name, { body, contentType: "image/png" });
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, `${name}.png`), body);
  fs.writeFileSync(path.join(DIR, `${name}.caption.txt`), caption, "utf-8");
  fs.writeFileSync(path.join(DIR, `${name}.spec.txt`), path.basename(testInfo.file), "utf-8");
  fs.writeFileSync(path.join(DIR, `${name}.title.txt`), testInfo.title, "utf-8");
}
