import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// トップページに表示するバージョンは、リポジトリルートの package.json から、ビルド時に埋め込む
const rootPackage = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

export default defineConfig({
  // GitHub Pages のように、サイトの途中のパスから配信するときに指定する（例: /opinion-map/）
  base: process.env["VITE_BASE"] ?? "/",
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPackage.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    // ローカル開発では、/api をバックエンド(localServer)へ中継する
    proxy: {
      "/api": {
        target: process.env["VITE_DEV_API_TARGET"] ?? "http://localhost:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
  },
});
