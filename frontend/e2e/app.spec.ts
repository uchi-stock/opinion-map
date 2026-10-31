import { expect, test } from "@playwright/test";
import { captureScreenshot } from "./screenshot.ts";

// 画面の横幅を超えてはみ出していないこと(iPhone で崩れていないこと)
async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("トップページ", () => {
  test("サンプルのボードが表示される", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Opinion Map" })).toBeVisible();
    await expect(page.getByRole("region", { name: "サンプル" })).toBeVisible();
    // 招待がなくても、公開中のイベントを選んで、入れる
    const events = page.getByRole("region", { name: "公開中のイベント" });
    await expect(events.getByRole("link").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(page, testInfo, `top-${testInfo.project.name}`, `トップページ(${testInfo.project.name})`);
  });
});

test.describe("参加者の画面", () => {
  test("意見を投稿し、一覧に出て、いいねできる", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.getByRole("link", { name: "参加者の画面（サンプル）" }).click();
    // 基本は、ボード(ホワイトボード)。投稿は、リンクから開く
    await expect(page.getByTestId("sticky-note").first()).toBeVisible();
    await expect(page.getByRole("form", { name: "意見の投稿フォーム" })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(page, testInfo, `participant-board-${testInfo.project.name}`, `参加者のボード(${testInfo.project.name})`);

    await page.getByRole("link", { name: "意見を投稿する" }).click();
    await expect(page.getByRole("form", { name: "意見の投稿フォーム" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(page, testInfo, `participant-form-${testInfo.project.name}`, `参加者の投稿画面(${testInfo.project.name})`);

    const text = "E2Eテストからの投稿です";
    await page.getByLabel("あなたの意見").fill(text);
    await page.getByRole("button", { name: "投稿する" }).click();
    await expect(page.getByText("投稿しました。ありがとうございます。")).toBeVisible();

    const list = page.getByRole("region", { name: "投稿された意見" });
    await expect(list.getByText(text)).toBeVisible();

    const like = list.getByRole("button", { name: /^いいね/ }).first();
    await like.click();
    await expect(list.getByRole("button", { name: /^いいね済み/ }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(page, testInfo, `participant-list-${testInfo.project.name}`, `投稿といいねのあと(${testInfo.project.name})`);
  });
});

test.describe("管理画面", () => {
  // デモ版は運営者トークンが入力済みになる。Google ログインの画面は、E2E の対象外(外部サービスのため)
  test("イベント一覧が表示される", async ({ page }, testInfo) => {
    await page.goto("/admin");
    await expect(page.locator("main")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(page, testInfo, `admin-${testInfo.project.name}`, `管理画面(${testInfo.project.name})`);
  });

  test("イベントのページは、コンパクト。編集、招待URL、テーマの追加は、別の画面", async ({ page }, testInfo) => {
    await page.goto("/admin");
    await page.locator('a[href^="/admin/events/"]:not([href$="/new"])').first().click();
    const info = page.getByRole("region", { name: "イベントの情報" });
    await expect(info).toBeVisible();
    await expect(page.getByLabel("イベント名")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(page, testInfo, `admin-event-${testInfo.project.name}`, `イベントのページ(${testInfo.project.name})`);

    // 重い操作は、メニューから、別の画面へ移る
    await page.getByRole("navigation", { name: "このイベントの操作" }).getByRole("link", { name: /^招待URLとQR/ }).click();
    await expect(page.getByRole("img", { name: "招待URLのQRコード" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(page, testInfo, `admin-invite-${testInfo.project.name}`, `招待URLとQR(${testInfo.project.name})`);

    await page.goBack();
    await page.getByRole("link", { name: "テーマを追加" }).click();
    await expect(page.getByRole("form", { name: "テーマを作る" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("テーマのページは、意見とボードを最初に見せる", async ({ page }, testInfo) => {
    await page.goto("/admin");
    await page.locator('a[href^="/admin/events/"]:not([href$="/new"])').first().click();
    await page.locator('a[href*="/sessions/"]:not([href$="/new"])').first().click();
    const opinions = page.getByRole("region", { name: "投稿された意見" });
    await expect(opinions).toBeVisible();
    // 設定のフォームより前に、意見が出ている(画面の上のほうにある)
    const top = await opinions.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    expect(top).toBeLessThan(700);
    // 基本はボード。意見の管理は、リンクから開く
    await expect(page.getByTestId("sticky-note").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await captureScreenshot(page, testInfo, `admin-theme-board-${testInfo.project.name}`, `テーマのページ・ボード(${testInfo.project.name})`);
    await page.getByRole("link", { name: "意見を管理する" }).click();
    await expect(page.getByRole("button", { name: "ボードへ戻る" })).toBeVisible();
    await page.getByRole("button", { name: "ボードへ戻る" }).click();
    await expect(page.getByTestId("sticky-note").first()).toBeVisible();
  });
});
