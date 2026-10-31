import "bootstrap/dist/css/bootstrap.min.css";
// 共通フォント(M PLUS Rounded 1c)は、外部CDNでなく、npm のパッケージでバンドルする
import "@fontsource/m-plus-rounded-1c/400.css";
import "@fontsource/m-plus-rounded-1c/700.css";
// dev-standards の共通テーマ(symlink。ブートストラップで作る)
import "./bootstrap-theme.css";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";

async function start() {
  let banner: ReactNode = null;
  // デモ版のときだけ、デモ用のコード（バックエンドを含む）を読み込む。通常のビルドには入らない
  if (import.meta.env.VITE_DEMO === "true") {
    const { setupDemo } = await import("./demo/setup.tsx");
    banner = (await setupDemo()).banner;
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        {banner}
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

void start();
