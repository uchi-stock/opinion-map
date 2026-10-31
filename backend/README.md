# backend

イベント・テーマ・投稿のAPIである。TypeScript、Node.js 22以上で動く。

## 構成

dev-standardsのサーバレスAPIパターンに合わせ、層を分けている。
アプリ本体は、frontend のデモ版とも共有するため、`../core/` に置く。
AWS やプロセスに依存する部分だけが、この `backend/` にある。

`core/src/` は、AWS に依存せず、frontend のデモ版とも共有する。

- `app.ts`: ルーティング、認証、エラーの変換
- `services/`: ビジネスロジック。永続化の詳細を知らない
- `repositories/`: 永続化の境界。メモリ実装と、保存先（KvStore）の上に作る実装
- `domain/`、`analysis/`、`insights/`、`lib/`、`adapters/`: 型、検証、分析と案の基盤、道具

`backend/src/` は、AWS やプロセスに依存する。

- `handler.ts`: Lambda の入口。DynamoDB、Fargate、Gemini をつなぐ
- `lambdaAdapter.ts`: API Gateway HTTP API のイベントとの変換
- `localServer.ts`: ローカル開発用のサーバー
- `repositories/dynamoKvStore.ts`: DynamoDB の保存先
- `adapters/awsRunnerPort.ts`: S3 と ECS の呼び出し

依存の向きは、`frontend` と `backend` から `core` へ、の一方向である。
`frontend` と `backend` は、互いに import しない（アーキテクチャの検査で守っている）。

## ローカルで動かす

```sh
cd backend
npm ci
npm run dev
```

起動すると、すぐ試せるイベントとテーマを1つ作り、ID と運営者トークンを表示する。

## API

運営者向けは、`Authorization: Bearer <ADMIN_TOKEN>` が必要である。
`ADMIN_TOKEN` が未設定のときは、常に拒否する。

`ADMIN_TOKEN` は、管理者のトークンである。
管理者の入口は、`ADMIN_TOKEN` と、Googleアカウントのログイン（管理者の一覧にあるメール）の2つである。
イベントごとの運営者トークンは廃止した。経緯は[ADR-0002](../docs/decisions/ADR-0002-operator-auth.md)を参照する。

| メソッド・パス | 用途 | 認証 |
| --- | --- | --- |
| `POST /auth/session` | Google の ID トークンを、オーナーのセッショントークンに交換する | Google のトークン |
| `GET /me` | ログイン中の権限 | 運営者 |
| `POST /events` | イベントを作る（下書き） | 運営者 |
| `GET /events` | イベント一覧 | 運営者 |
| `PATCH /events/:id` | イベントを編集する（状態は draft / active / archived） | 運営者 |
| `POST /events/:id/sessions` | テーマを作る（下書き） | 運営者 |
| `GET /events/:id/sessions` | テーマ一覧 | 運営者 |
| `PATCH /sessions/:id` | テーマを編集する（状態は draft / active / closed） | 運営者 |
| `GET /public/events` | 公開中(active)のイベントの一覧。名前と説明だけ。トップページに出す。新しい順で、50件まで | 不要 |
| `GET /sessions/:id` | 問いなどの表示用の情報 | 不要 |
| `POST /sessions/:id/opinions` | 意見を投稿する | 不要 |
| `GET /sessions/:id/opinions` | 意見の一覧 | 不要（運営者は設定にかかわらず全件） |
| `PATCH /opinions/:id` | 自分の投稿を編集する（編集用の鍵が必要） | 鍵 |
| `POST /opinions/:id/delete` | 自分の投稿を削除する（編集用の鍵が必要） | 鍵 |
| `POST /sessions/:id/presence` | 画面を見ていることを知らせる(`deviceId`)。人数の目安に使う | 不要 |
| `POST /opinions/:id/reaction` | いいねを付ける・外す(`voterId` と `reacted`)。同じ投票者は1回だけ。受け付け中のテーマだけ | 不要 |
| `POST /opinions/:id/moderation` | 投稿を非表示・再表示・削除する（status は active / hidden / deleted） | 運営者 |
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

## 投稿の頻度制限と、編集・削除

方式と理由は[ADR-0003](../docs/decisions/ADR-0003-spam-and-author-control.md)を参照する。

- テーマごとに、1分に120件を超える投稿は、429を返す（`opinionRateLimit` で変えられる）
- 投稿時に `editKey`（128ビット以上の乱数）を送ると、あとで編集・削除できる。サーバーにはハッシュだけを保存する
- 削除した投稿は、本文を消し、過去の分析の入力の記録からも消す

## 見ている人数の目安

イベントの公開情報（`GET /events/:id/public`）の `viewers` に、テーマごとの目安が付く。

- 参加者の画面は、見ている間だけ、30秒ごとに知らせる。端末のIDは、ブラウザが作る乱数で、サーバーにはハッシュだけを残す
- 直近90秒に知らせた端末の数を数える。記録は、10分で消える（DynamoDB の ttl）
- 5人未満は、人数を出さず `"few"`（少数）とだけ返す。それ以上は、5人きざみに丸める。少人数の場で、個人を推測できないようにする

## 作成者とアイコン

- イベントを作ると、作った管理者のメールを `createdBy` に記録する。合言葉やトークンで作ったときは `(token)` になる。以前のイベントには無い
- Google でログインすると、プロフィール画像のURLを、管理者の記録に保存する。保存するのは、Google の配信元（`https://*.googleusercontent.com`）のURLだけである
- `GET /events`（オーナー）は、作成者の画像を `creatorPicture` として添える。`GET /me` は、ログイン中のアカウントの `picture` を返す
- 運営者のトークンでの `GET /events` には、管理者のメールを含めない

## 設計上の決まり

- 投稿者を特定できる情報は、保存も返却もしない
- 投稿には、ブラウザが作る使い捨ての `submissionId` が必要である。同じ値の再送は、新しい投稿を作らない
- 投稿は、イベントとテーマが両方とも `active` のときだけ受け付ける
- 下書きのイベントは、公開情報（`GET /events/:id/public`）が `status: "draft"` を返す。名前や中身は返さない。参加者の画面は「開始をお待ちください」と出す
- 下書きのテーマは、参加者には 404 になる。イベントの公開情報の一覧にも出ない
- 文字数の上限は、初期値が300文字である
- 本文はそのまま保存する。HTMLのエスケープは、表示側で行う
- 想定外のエラーでは、詳細や投稿本文を返さない

## DynamoDB

本番は DynamoDB に保存する（`src/repositories/dynamoRepositories.ts`）。Lambda のエントリポイントは `src/handler.ts` である。

- 1つのテーブルに、すべての種類の項目を置く。主キーは `pk`、一覧は GSI1（`gsi1pk` と `gsi1sk`）で引く
- 投稿の二重送信は、送信IDの印と投稿を、1つのトランザクションで書いて防ぐ。並行して来ても、1件しか作られない
- 分析の重複実行は、テーマごとのロックと実行を、1つのトランザクションで書いて防ぐ。ロックは終了時に外れ、2時間で失効する
- GSI は結果整合である。書いた直後の一覧は、反映が遅れることがある
- 項目は 400KB までである。分析の実行は、入力の投稿の本文を含むため、投稿が数百件で超える
  - 入力の投稿は、100件ごとの別の項目（`ANALYSISINPUT#<実行>#<番号>`）に分けて置く。実行の項目には、IDと件数だけを持たせる
  - 1回の分析で扱えるのは、1500件までである。超えると、分かりやすい理由で断る（`too_many_opinions`）
  - 一覧は、本文を持たない軽い形で返す。本文が要るときだけ、全体を読む
  - 投稿を削除すると、分けた項目からも本文が消える（ADR-0003）
  - メモリ実装も、400KB を超える項目を断る。設計の見落としを、テストで見つける

環境変数は次のとおりである。

| 名前 | 用途 |
| --- | --- |
| `TABLE_NAME` | DynamoDB のテーブル名（必須） |
| `GOOGLE_CLIENT_ID`・`SESSION_SECRET` | オーナーの Google ログイン。2つ揃うと有効 |
| `OWNER_EMAILS` | 管理者の初期登録(カンマ区切り)。一覧が空のときだけ使う。以降は管理画面で更新する |
| `ADMIN_TOKEN` | オーナーの合言葉（任意） |
| `ALLOWED_ORIGIN` | CORS で許可するオリジン |
| `GEMINI_API_KEY` | 共通点・相違点・問いの案に使う |

## テスト

```sh
npm test
npm run lint
```

## 静的解析

`npm run lint` は、oxlint と型の検査（`tsc --noEmit`）を実行する。frontend と同じ oxlint を使う。

- 条件によって項目を足すスプレッド（`...(条件 ? { 項目 } : {})`）は、`exactOptionalPropertyTypes` のもとで、値が無い項目を作らないために必要である。そのため、`no-useless-spread` と `no-useless-fallback-in-spread` は許可している（`.oxlintrc.json`）
- 制御文字を探す正規表現は、目的が制御文字の検出なので、その行だけ `no-control-regex` を許可している
- 新しい指摘は、直すか、理由を書いて許可する

## カバレッジ

CI で `vitest --coverage` を実行し、行・文・分岐が閾値（`ci.yml` の `coverage_threshold`）を下回ると失敗する。閾値は、実測に近い値から始めて、上げていく。下げない。

- 測らないものは `vitest.config.ts` に、理由つきで書いてある
  - `localServer.ts`: ローカル開発用のサーバー
  - `handler.ts`: Lambda の配線。デプロイ後の動作確認で守る
  - `adapters/awsRunnerPort.ts`: 実 AWS の呼び出し。`verify-analysis` ワークフローで守る
- CI の計測は、メモリ実装のテストの1回分である。DynamoDB 実装のテスト（`TEST_REPOS=dynamo`）は、別に実行される
- ローカルでの確認: `npx vitest run --coverage`

## DynamoDB Local での検証

本物の DynamoDB と同じ挙動で、保存先の契約と、並行の競合を確かめるテストがある（`test/dynamoLocal.test.ts`）。
CI では、サービスコンテナの DynamoDB Local に対して実行する。

- 確かめること: 条件付き書き込み、トランザクション、GSI の並びと件数、並行して呼んだときの競合（投稿の重複、分析の排他、1日の上限、いいね）
- メモリ実装と DynamoDB 実装に、同じ期待を課す。差があれば、このテストが見つける
- `DYNAMODB_ENDPOINT` が無いときは、スキップされる
- ローカルでは、先に `docker run -p 8000:8000 amazon/dynamodb-local` で DynamoDB Local を起動する
- そのあと、次のコマンドでテストを実行する
  - `DYNAMODB_ENDPOINT=http://localhost:8000 npx vitest run test/dynamoLocal.test.ts`
- 1500件の分析の実行を、分けて保存し、すべて読み戻せることを確かめている
