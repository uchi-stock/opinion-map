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
