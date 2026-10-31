import { defineConfig, devices } from "@playwright/test";

// デモ版(バックエンドがブラウザの中で動く)をビルドして配信し、AWS なしで画面を通して確かめる。
// CI の E2E ジョブは chromium だけを入れるため、iPhone は chromium で画面幅と操作を再現する(WebKit は使わない)。
const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: `http://localhost:${PORT}/` },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: {
    command: `VITE_DEMO=true npx vite build --outDir dist-demo --emptyOutDir && npx vite preview --outDir dist-demo --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
  },
});
