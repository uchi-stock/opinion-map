import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportClientError } from "../api/client.ts";

interface State {
  failed: boolean;
}

/**
 * 画面の描画中の予期しないエラーを受け止める。画面が真っ白のまま操作できなくなるのを防ぎ、
 * エラーの種類と短いメッセージだけをサーバーのログに送る(投稿の内容や、個人の情報は送らない)。
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    reportClientError(error);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="container py-4" style={{ maxWidth: 640 }}>
        <div className="alert alert-danger" role="alert">
          <p className="mb-2">画面でエラーが起きました。運営に自動で知らせました。</p>
          <button type="button" className="btn btn-outline-danger" onClick={() => window.location.reload()}>
            もう一度読み込む
          </button>
        </div>
      </main>
    );
  }
}
