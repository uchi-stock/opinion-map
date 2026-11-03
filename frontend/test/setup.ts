import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// 全体を並列で動かすと遅くなり、画面の更新を待つ既定の1秒では足りないことがあるため、余裕を持たせる
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
});
