# 本番へのデプロイ

本番の構成と、スマホのブラウザだけで行うデプロイの手順をまとめる。
構成管理は OSLS（Serverless Framework のオープンソース版）である。定義は `backend/serverless.yml` にある。

## 構成

1つのスタック（`opinion-map-prod`）に、次をまとめる。

| リソース | 役割 |
| --- | --- |
| DynamoDB | データの保存。1つのテーブルと、一覧用の GSI1 |
| Lambda と API Gateway | API。1つの関数が、内部でルーティングする |
| S3 | 画面（フロントエンド）の置き場。非公開 |
| CloudFront | 同じドメインで、画面と API を配信する |

- 画面は `https://<ドメイン>/`、API は `https://<ドメイン>/api/*` で配信する。同じドメインなので、CORS の設定は要らない
- `/s/<ID>` や `/admin` など、拡張子のないパスは、CloudFront Function が `index.html` で返す。API の 404 は、そのまま返す
- S3 は、CloudFront からの読み取りだけを許可する
- DynamoDB のテーブルは、スタックを消しても残る。ポイントインタイムリカバリを有効にしている

## 必要な設定（GitHub の Settings → Secrets and variables → Actions）

AWS のキーは必須である。オーナーのログインは、Google ログインか合言葉の、どちらかを用意する。

| 種類 | 名前 | 用途 |
| --- | --- | --- |
| Secret | `AWS_ACCESS_KEY_ID` | デプロイに使う IAM ユーザーのキー |
| Secret | `AWS_SECRET_ACCESS_KEY` | 同上 |
| Secret または Variable | `GOOGLE_OAUTH_CLIENT_ID` | Google ログインのクライアントID |
| Secret（任意） | `SESSION_SECRET` | ログイン後のセッションの署名鍵。32文字以上のランダムな文字列。なければ、AWS のシークレットキーから自動で作る |
| Secret または Variable | `OWNER_EMAILS` | オーナーにする Google アカウントのメールアドレス。カンマ区切り |
| Secret（任意） | `ADMIN_TOKEN` | 合言葉でのログイン。Google ログインを使うなら不要 |
| Secret（任意） | `GEMINI_API_KEY` | 共通点・相違点・問いの案に使う |
| Variable（任意） | `AWS_REGION` | 既定は `ap-northeast-1` |

- `SESSION_SECRET` を自動で作る場合、AWS のキーを入れ替えると値が変わる。発行済みのセッションは使えなくなり、ログインし直しになる
- `OWNER_EMAILS` に載っていないアカウントは、Google でログインできても、オーナーになれない
- `OWNER_EMAILS` から外すと、発行済みのセッションも、その場で使えなくなる
- `ADMIN_TOKEN` は、AWS の Lambda の環境変数に平文で入る。AWS のコンソールを見られる人は、読める

## デプロイの手順（スマホで完結）

1. GitHub の Actions 画面で「本番へデプロイ」を開く
2. 「Run workflow」を押す
3. 完了を待つ。初回は、CloudFront の作成に10分ほどかかる
4. 実行の Job Summary に、公開URLと、動作確認の結果が出る
5. **初回だけ**: Google Cloud Console の OAuth クライアントを開く。「承認済みの JavaScript 生成元」に、公開URL（`https://xxxx.cloudfront.net`）を追加する
6. 公開URLの `/admin` を開き、「Google でログイン」を押す

5 の追加をしないと、Google のボタンを押してもログインできない。公開URLは、1回目のデプロイが終わるまで分からない。

動作確認では、次を自動で確かめる。

- 画面（`/` と `/admin`）が返る
- `GET /api/health` が返る
- トークンなしの運営者 API が 401 を返す
- 存在しないセッションが 404 を返す（DynamoDB まで届いている）
- Google ログインが有効である（設定している場合）
- 合言葉で一覧を読める（設定している場合）

## IAM ユーザーに必要な権限

デプロイ用の IAM ユーザーには、次の権限が要る。

- CloudFormation（スタックの作成・更新）
- S3（Serverless のデプロイ用バケットと、画面のバケット）
- Lambda、API Gateway、DynamoDB、CloudFront
- IAM（Lambda の実行ロールの作成）
- CloudWatch Logs

権限が足りないと、`osls deploy` が `AccessDenied` で失敗する。失敗した操作名がログに出るので、その権限を足す。

## 初回によくある失敗

- **オーナーのログインがない**: 最初の手順で止まり、足りない名前を出す。値は出さない
- **権限不足**: 上記のとおり、失敗した操作の権限を足す
- **CloudFront を作れない**: アカウントの確認が済んでいないと、作成できないことがある。AWS のサポートの案内に従う

## 運用で知っておくこと

- 画面だけを更新したいときも、同じワークフローを使う。インフラに変更がなければ、`osls deploy` は短く終わる
- CloudFront のキャッシュは、デプロイごとに消す。`index.html` は、毎回確かめさせる設定である
- 分析の実行（広聴AI）は、まだ接続していない。分析のAPIは、`503` を返す。起動の方式は[比較ドキュメント](analysis-runtime-options.md)を参照する
- DynamoDB は、実機での動作を、このデプロイで初めて確かめる。動作確認が失敗したら、ログと CloudWatch Logs を確認する
