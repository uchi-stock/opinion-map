# 広聴AIの分析品質評価（spike）

広聴AIをGitHub Actions上で実行し、サンプル意見の分析品質を評価する。

- `inputs/sample.csv`: 架空のサンプル意見40件。実在の個人情報は含まない
- `config.json`: Geminiを使う設定
- 実行: Actionsの「広聴AI評価」を手動実行する。リポジトリのSecretsに`GEMINI_API_KEY`が必要
- 結果: Job Summaryにクラスタと意見数を表示し、出力一式をartifactに保存する
