import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";
import reactHooks from "eslint-plugin-react-hooks";

// 複雑度・認知的複雑度・ファイルサイズを見る lint。oxlint が見ない観点を補う
// （dev-standards/docs/code-quality-conventions.md「lint」）。
// 標準の値（complexity 15、認知的複雑度 15、max-lines 300）を、すべてのファイルに適用する。
// 導入時点で超えていたファイルだけ、現状の値に固定する（ラチェット）。上げない。直したら、この表から消す。
// 新しいコードは標準の値で判定される。

/** ファイルごとの、導入時点の complexity（循環的複雑度）の最大値 */
const COMPLEXITY_RATCHET = {
    "core/src/adapters/kouchouAi.ts": 24,
    "core/src/analysis/validation.ts": 23,
    "core/src/domain/validation.ts": 19,
    "core/src/lib/googleAuth.ts": 16,
    "frontend/src/App.tsx": 28,
    "frontend/src/components/admin/AnalysisPanel.tsx": 18,
    "frontend/src/pages/ParticipantPage.tsx": 31,
    "frontend/src/pages/admin/AdminSessionPage.tsx": 17,
};
/** ファイルごとの、導入時点の認知的複雑度の最大値 */
const COGNITIVE_RATCHET = {
    "core/src/adapters/kouchouAi.ts": 31,
    "core/src/analysis/validation.ts": 28,
    "core/src/domain/validation.ts": 21,
    "core/src/insights/validation.ts": 21,
    "core/src/repositories/kvStore.ts": 19,
    "core/src/services/analysisService.ts": 18,
    "frontend/src/App.tsx": 19,
    "frontend/src/pages/ParticipantPage.tsx": 21,
};
/** ファイルごとの、導入時点の実効行数（コメント・空行を除く） */
const MAX_LINES_RATCHET = {
    "core/src/app.ts": 528,
    "core/src/domain/validation.ts": 342,
    "core/src/repositories/dynamoRepositories.ts": 323,
    "frontend/src/pages/admin/AdminSessionPage.tsx": 414,
};

const source = ["frontend/src/**/*.{ts,tsx}", "backend/src/**/*.ts", "core/src/**/*.ts"];

export default tseslint.config(
  // oxlint 向けの disable コメントが残っているため、ESLint では未使用の指摘を出さない
  { linterOptions: { reportUnusedDisableDirectives: "off" } },
  {
    ignores: [
      "**/node_modules/**", "**/dist*/**", "**/coverage/**", "**/.serverless/**", "dev-standards/**",
      "eval/**", "kouchou-runner/**", "**/e2e-screenshots/**", "**/playwright-report/**", "**/test-results/**",
    ],
  },
  {
    files: source,
    languageOptions: { parser: tseslint.parser },
    plugins: { sonarjs, "react-hooks": reactHooks },
    rules: {
      ...sonarjs.configs.recommended.rules,
      complexity: ["error", 15],
      "sonarjs/cognitive-complexity": ["error", 15],
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
      "react-hooks/exhaustive-deps": "error",
      // 次の規則は、この製品では使わない。理由を添える
      "sonarjs/void-use": "off", // `void promise` は、結果を待たない呼び出しを示す書き方として使う
      "sonarjs/no-unused-vars": "off", // 未使用の変数は、oxlint と tsc(noUnusedLocals)が見る。省略の分割代入(`const { a: _a, ...rest }`)を許す
      "sonarjs/pseudo-random": "off", // Math.random は、crypto が無い環境での代わり。ID の衝突を避けるためで、秘密を守る用途ではない
      "sonarjs/no-nested-conditional": "off", // JSX の表示切り替えと、文言の選択で自然に入れ子になる。読みやすさは、レビューで見る
      "sonarjs/no-nested-template-literals": "off", // 文言の組み立てで使う。読みやすさは、レビューで見る
      "sonarjs/no-nested-functions": "off", // コールバックの入れ子は、非同期の処理と React の副作用で避けにくい
    },
  },
  ...Object.entries(COMPLEXITY_RATCHET).map(([file, max]) => ({ files: [file], rules: { complexity: ["error", max] } })),
  ...Object.entries(COGNITIVE_RATCHET).map(([file, max]) => ({ files: [file], rules: { "sonarjs/cognitive-complexity": ["error", max] } })),
  ...Object.entries(MAX_LINES_RATCHET).map(([file, max]) => ({
    files: [file],
    rules: { "max-lines": ["error", { max, skipBlankLines: true, skipComments: true }] },
  })),
);
