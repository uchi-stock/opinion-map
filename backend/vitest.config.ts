import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      // 閾値の判定(CI)が、集計のJSONを読む。閾値を使うときは、設定側で出力する必要がある
      reporter: ["text", "json-summary"],
      // アプリ本体は ../core にある(frontend のデモとも共有する)ので、そこも測る
      include: ["src/**/*.ts", "**/core/src/**/*.ts"],
      allowExternal: true,
      // 測らないもの(理由つき)。実 AWS やプロセスの起動に依存し、単体テストでは守れない
      exclude: [
        "src/localServer.ts", // ローカル開発用のサーバー
        "src/handler.ts", // Lambda の配線。デプロイ後の動作確認で守る
        "src/adapters/awsRunnerPort.ts", // 実 AWS(S3、ECS)の呼び出し。verify-analysis ワークフローで守る
      ],
    },
  },
});
