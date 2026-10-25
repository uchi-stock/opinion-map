# 分析基盤候補OSSのライセンスと保守状況

分析基盤の候補3件を、一次情報（各リポジトリ）で確認した結果をまとめる。確認日は2026-10-25である。法的判断ではない。専門家確認が必要な点は末尾に列挙する。

## 比較表

| 項目 | 広聴AI | Polis | いどばた |
| --- | --- | --- | --- |
| リポジトリ | [digitaldemocracy2030/kouchou-ai](https://github.com/digitaldemocracy2030/kouchou-ai) | [compdemocracy/polis](https://github.com/compdemocracy/polis) | [digitaldemocracy2030/idobata](https://github.com/digitaldemocracy2030/idobata) |
| ライセンス | AGPL-3.0 | AGPL-3.0＋section 7の追加許諾 | GPL-3.0 |
| 最新コミット | 2026-10-24 | 2026-10-24 | 2026-07-03 |
| 主な役割 | CSVの意見を分析しレポートを生成する | 参加者の投票から意見グループを抽出する | 意見収集と論点抽出を行うWebアプリ |
| 入力 | CSV、スプレッドシート、プラグイン | 参加者がUIから投票・投稿する | ユーザー画面からの投稿 |
| 外部API | あり（HTTP） | 未確認 | 未確認 |
| デプロイ | Docker Compose | Docker Compose | Docker Compose |

## 広聴AI

- ライセンスは `LICENSE` が AGPL-3.0 である。`packages/analysis-core/pyproject.toml` も AGPL-3.0 である
- 同梱の[利用ガイド](https://github.com/digitaldemocracy2030/kouchou-ai/blob/main/docs/user-guide/license.md)に、次の記述がある
  - 手元での分析や、結果のデータのみの公開では、ソース公開の義務は生じない
  - 改造版をネットワーク越しに使ってもらう場合は、利用者がソースを入手できるようにする
- 外部APIがある。API は FastAPI で、管理系は `x-api-key` ヘッダーで認証する
  - `POST /admin/reports` でレポートを作成する。202で受け付ける非同期処理である
  - 入力は `comments`（`id`・`comment`、任意で `source`・`url`）、`cluster`（層ごとのクラスタ数）、`model`、`prompt` 等である
  - 状態取得や結果取得の管理APIもある
- 出力は、意見・要約・グループ分け・座標を含むJSONとHTMLである
- 利用には、LLM のAPIキー（OpenAI 等）が必要である。ローカルLLM（Ollama）の設定もある

## Polis

- ライセンスは AGPL-3.0 に、section 7 の追加許諾を加えたものである
  - 追加許諾は、列挙された依存ライブラリとリンクして配布する場合の扱いを定めている
  - 本プロダクトでの影響は未確認である
- 構成が大きい（Clojure、Rust、Python、複数のクライアント等）。運用の負荷は広聴AIより高いと見込まれる
- 外部APIの有無と安定性は未確認である
- 日本語への対応状況は未確認である

## いどばた

- 対象リポジトリは `digitaldemocracy2030/idobata` と特定した。`vision/`（意見収集・論点抽出）と `policy/`（政策）の2モジュール構成である
- ライセンスは GPL-3.0 である。AGPL ではないため、ネットワーク越しの提供そのものは配布に当たらない。ただし解釈は専門家に確認する
- 構成は Node.js（Express）と MongoDB である。分析基盤ではなく、意見収集まで含むWebアプリである
- 最新コミットは約4か月前で、広聴AIより更新が古い
- 外部APIの有無は未確認である

## 本プロダクトでの扱い（案）

- 広聴AIは、別プロセスのHTTP APIとして呼び出す前提で最も評価しやすい。コードの組み込みは行わない
- 組み込みの場合と別プロセスの場合で、AGPLの義務が変わる。この区別は専門家に確認する

## 未確認事項・専門家確認が必要な点

- 依存パッケージのライセンス（各リポジトリの依存の一覧化は未実施）
- AGPLのネットワーク利用条項が、別プロセス呼び出しに及ぶ範囲
- Polisの追加許諾の適用範囲
- ロゴ・名称の利用条件、モデル・データセットのライセンス
- 外部AIプロバイダーへ投稿本文を送る際の、送信先の利用条件
