# backend

イベント・セッション・投稿のAPIである。TypeScript、Node.js 22以上で動く。

## 構成

dev-standardsのサーバレスAPIパターンに合わせ、層を分けている。

- `src/app.ts`: ルーティング、認証、エラーの変換
- `src/services/`: ビジネスロジック。永続化の詳細を知らない
- `src/repositories/`: 永続化の境界。いまは in-memory 実装のみ
- `src/lambdaAdapter.ts`: API Gateway HTTP API のイベントとの変換
- `src/localServer.ts`: ローカル開発用のサーバー

DynamoDBの実装とデプロイは、別のIssueで行う。
それまでは、データはメモリ上にだけある。

## ローカルで動かす

```sh
cd backend
npm ci
npm run dev
```

起動すると、すぐ試せるイベントとセッションを1つ作り、ID と運営者トークンを表示する。

## API

運営者向けは、`Authorization: Bearer <ADMIN_TOKEN>` が必要である。
`ADMIN_TOKEN` が未設定のときは、常に拒否する。

`ADMIN_TOKEN` は、オーナーのトークンである。
オーナーは、イベントごとの運営者トークンを発行・失効できる（`POST /events/:id/operator-tokens`、`POST /operator-tokens/:id/revoke`）。
運営者トークンは、担当のイベントだけを操作できる。方式は[ADR-0002](../docs/decisions/ADR-0002-operator-auth.md)を参照する。

| メソッド・パス | 用途 | 認証 |
| --- | --- | --- |
| `POST /events` | イベントを作る（下書き） | 運営者 |
| `GET /events` | イベント一覧 | 運営者 |
| `PATCH /events/:id` | イベントを編集する（状態は draft / active / archived） | 運営者 |
| `POST /events/:id/sessions` | セッションを作る（下書き） | 運営者 |
| `GET /events/:id/sessions` | セッション一覧 | 運営者 |
| `PATCH /sessions/:id` | セッションを編集する（状態は draft / active / closed） | 運営者 |
| `GET /sessions/:id` | 問いなどの表示用の情報 | 不要 |
| `POST /sessions/:id/opinions` | 意見を投稿する | 不要 |
| `GET /sessions/:id/opinions` | 意見の一覧 | 不要（運営者は設定にかかわらず全件） |
| `POST /sessions/:id/analyses` | 分析を始める | 運営者 |
| `GET /sessions/:id/analyses` | 分析の一覧 | 運営者 |
| `GET /analyses/:id` | 分析の状態と結果 | 運営者 |
| `POST /analyses/:id/retry` | 失敗した分析を再実行する | 運営者 |
| `POST /analyses/:id/clusters/:clusterId/insights` | 共通点・相違点・問いの案をAIで作る | 運営者 |
| `GET /analyses/:id/insights` | 案の一覧 | 運営者 |
| `PATCH /insights/:id` | 案を編集する、採用を切り替える | 運営者 |

## 共通点・相違点・問いの案

完了した分析のクラスタごとに、AIが案を作る。環境変数 `GEMINI_API_KEY` があるときだけ使える（ローカルサーバー）。
未設定のときは 503 を返す。

- AIの出力（`ai`）は変更しない。ファシリテーターの編集は `edited` に別に保存する
- 案は、作った時点では採用されていない（`approved: false`）。自動で使われない
- 出力は検証し、形が違えば保存せず 502 を返す
- 意見は、データとして渡す。意見の中の指示には従わないよう、プロンプトで指示する

## 設計上の決まり

- 投稿者を特定できる情報は、保存も返却もしない
- 投稿には、ブラウザが作る使い捨ての `submissionId` が必要である。同じ値の再送は、新しい投稿を作らない
- 投稿は、イベントとセッションが両方とも `active` のときだけ受け付ける
- 下書きのイベント・セッションは、参加者には 404 になる
- 文字数の上限は、初期値が300文字である
- 本文はそのまま保存する。HTMLのエスケープは、表示側で行う
- 想定外のエラーでは、詳細や投稿本文を返さない

## テスト

```sh
npm test
npm run lint
```
