import "bootstrap/dist/css/bootstrap.min.css";
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
