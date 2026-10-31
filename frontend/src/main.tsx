import "bootstrap/dist/css/bootstrap.min.css";
// 共通フォント(M PLUS Rounded 1c)は、外部CDNでなく、npm のパッケージでバンドルする
import "@fontsource/m-plus-rounded-1c/400.css";
import "@fontsource/m-plus-rounded-1c/700.css";
// dev-standards の共通テーマ(symlink。ブートストラップで作る)
import "./bootstrap-theme.css";
import "./app.css";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import ServiceWorkerRegistration from "./pwa/ServiceWorkerRegistration.jsx";
import UpdateNotifier from "./pwa/UpdateNotifier.jsx";

/** Service Worker は、本番のビルドだけで使う。開発サーバーとデモ版では、キャッシュが邪魔になるため登録しない */
const USE_SERVICE_WORKER = import.meta.env.PROD && import.meta.env.VITE_DEMO !== "true";

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
        {USE_SERVICE_WORKER && (
          <>
            <ServiceWorkerRegistration swUrl={`${import.meta.env.BASE_URL}sw.js`} />
            <UpdateNotifier />
          </>
        )}
      </ErrorBoundary>
    </StrictMode>,
  );
}

void start();
