import type { ReactNode } from "react";
import { saveAdminToken } from "../lib/adminToken.ts";
import { withBase } from "../lib/paths.ts";
import { DemoBanner } from "./DemoBanner.tsx";
import { DEMO_ADMIN_TOKEN, installDemoApi } from "./installDemoApi.ts";
import { resetDemoData } from "./storageRepositories.ts";

/** デモ版の準備。バックエンドの差し替えと、運営者のトークンの入力済み、お知らせの用意をする */
export async function setupDemo(): Promise<{ banner: ReactNode }> {
  const { sampleSessionId } = await installDemoApi();
  saveAdminToken(DEMO_ADMIN_TOKEN);

  function reset() {
    if (!window.confirm("作ったイベントや投稿を、すべて消して、最初からやり直します。よろしいですか？")) return;
    resetDemoData(window.localStorage);
    window.location.assign(withBase("/"));
  }

  return { banner: <DemoBanner sampleSessionId={sampleSessionId} onReset={reset} /> };
}
