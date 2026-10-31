import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // 測らないもの(理由つき)。実 AWS やプロセスの起動に依存し、単体テストでは守れない
      exclude: [
        "src/localServer.ts", // ローカル開発用のサーバー
        "src/handler.ts", // Lambda の配線。デプロイ後の動作確認で守る
        "src/adapters/awsRunnerPort.ts", // 実 AWS(S3、ECS)の呼び出し。verify-analysis ワークフローで守る
      ],
    },
  },
});
