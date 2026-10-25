# Opinion Map

**意見の違いを、対話のきっかけに。**

Opinion Mapは、オンラインカンファレンスやワークショップで参加者の意見を集めるアプリです。共通点・相違点を可視化し、より深い対話につなげるオープンソースのブロードリスニングツールを目指します。

> 状態: 開発の初期段階です。参加者が意見を投稿し、カードで見る機能ができています。分析の機能は、これから作ります。

## Goals

- 誰もが気軽に意見を投稿できる参加型の場をつくる
- AIを活用して、多様な意見の共通点・相違点を発見する
- 少数意見や異なる前提を尊重し、議論のきっかけを生み出す
- 講演、ワークショップ、Open Space Technology（OST）を横断して使えるようにする

## Core Features（予定）

実装済みなのは、匿名での意見投稿（ログイン不要）です。

- 匿名での意見投稿（ログイン不要）
- AIによる意見のクラスタリング
- 共通点・相違点の可視化
- ファシリテーター主導の分析実行
- 議論する論点の選択と気づきの記録

## Principles

1. 対話を促進する。分類や集計自体をゴールにしない
2. 違いを尊重する。異なる意見を安易に統合・消去しない
3. 少数意見を残す
4. 分析結果から元の投稿へ戻れる
5. AIの出力は仮説である。編集・却下できる提案として扱い、事実や合意とみなさない
6. 分析履歴を上書きせず、入力と版を記録する
7. 分析はファシリテーターが明示的に実行する
8. 個人情報は必要以上に収集しない。参加者投稿は初期設定で匿名とする

## デモ版を試す

サーバーなしで、スマホのブラウザから、運営者と参加者の両方の画面を試せる。
データは、そのブラウザの中にだけ保存される。

公開先は、`https://uchi-stock.github.io/opinion-map/` である。
公開するには、リポジトリの Settings → Pages で、Source を「GitHub Actions」にして、Actions の「デモ版の公開」を実行する。

## ローカルで試す

Node.js 22以上が必要である。

1. バックエンドを起動する。データはメモリ上にあり、再起動すると消える。

   ```sh
   cd backend
   npm ci
   npm run dev
   ```

   起動時に、「セッションID」が表示される。

2. 別のターミナルで、フロントエンドを起動する。

   ```sh
   cd frontend
   npm ci
   npm run dev
   ```

3. ブラウザで `http://localhost:5173/s/<セッションID>` を開く。

詳しくは、[backend](backend/README.md) と [frontend](frontend/README.md) を参照する。

## 構成

| ディレクトリ | 内容 |
| --- | --- |
| `backend/` | イベント・セッション・投稿のAPI（TypeScript） |
| `frontend/` | 参加者の画面（React + Vite） |
| `docs/` | 調査結果と意思決定の記録 |
| `eval/kouchou/` | 広聴AIの分析品質を評価するためのサンプルと設定 |

## Philosophy

The goal is not just to collect opinions or find consensus, but to turn diverse perspectives into meaningful dialogue and new insights.

## Docs

- [分析基盤候補OSSのライセンスと保守状況](docs/oss-candidates-license.md)
- [ADR-0001: 分析基盤に広聴AIを別プロセスのHTTP APIとして使う](docs/decisions/ADR-0001-analysis-provider.md)

## License

[MIT License](LICENSE)。広聴AIは改造せず、別のサービスとして使います。改造する場合や、非公開・商用にする場合は、ライセンスの扱いを見直します（[ADR-0001](docs/decisions/ADR-0001-analysis-provider.md)）。
