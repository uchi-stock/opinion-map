# frontend

参加者向けの画面である。React 19、Vite、TypeScript、Bootstrap 5.3で作っている。

## 画面

| パス | 内容 |
| --- | --- |
| `/` | トップページ。キャッチコピー、バージョン、更新日時 |
| `/s/<セッションID>` | 参加者の画面。問い、投稿についての案内、投稿フォーム、意見のカード |
| `/admin` | 運営者の画面。イベントの一覧と作成。最初に運営者のトークンを入力する |
| `/admin/events/<イベントID>` | イベントの設定、状態の切り替え、セッションの一覧と作成 |
| `/admin/events/<イベントID>/sessions/<セッションID>` | セッションの設定、状態の切り替え、参加者のURLとQRコード、投稿された意見 |

## ローカルで動かす

バックエンドを先に起動する。

```sh
cd backend && npm ci && npm run dev
```

起動時に表示される「セッションID」を控える。続けて、フロントエンドを起動する。

```sh
cd frontend
npm ci
npm run dev
```

ブラウザで `http://localhost:5173/s/<セッションID>` を開く。
運営者の画面は、`http://localhost:5173/admin` である。
ローカルのバックエンドの運営者トークンは、起動時に表示される（初期値は `local-dev-admin-token`）。
`/api` へのリクエストは、バックエンド（`http://localhost:8787`）へ中継される。
中継先は、環境変数 `VITE_DEV_API_TARGET` で変えられる。

## デモ版

サーバーなしで、ブラウザの中だけで動くデモ版を作れる。
本物のバックエンドのコードを、そのままブラウザで動かす。

- データは、見る人のブラウザの `localStorage` に保存する。他の人とは共有されない
- 運営者のトークンは「demo」で、入力済みの状態になる
- はじめに、公開済みのイベントとセッション、サンプルの意見を作る
- 画面の上に、デモ版であることと、「最初からやり直す」ボタンを表示する

```sh
VITE_DEMO=true VITE_BASE=/opinion-map/ npm run build
```

GitHub Pages には、`.github/workflows/pages.yml` で公開する。
Actions の「デモ版の公開」を手動で実行するか、`main` へ push すると公開される。
初回は、リポジトリの Settings → Pages で、Source を「GitHub Actions」にする。

## 環境変数

| 名前 | 用途 | 初期値 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | ビルドしたアプリが呼ぶAPIのURL | `/api` |
| `VITE_DEMO` | `true` のとき、デモ版としてビルドする | なし |
| `VITE_BASE` | サイトの途中のパスから配信するときの、基準パス（例: `/opinion-map/`） | `/` |

## 設計上の決まり

- 運営者のトークンは、このブラウザの `localStorage` にだけ保存する。保存できない環境でも動く（その場合は、毎回入力する）
- 運営者の画面では、QRコードを図形（SVG）として描く。HTML文字列は埋め込まない
- 意見の本文は、文字列として描画する。`dangerouslySetInnerHTML` は使わない
- 投稿ボタンは、送信中は押せない。連打しても1回しか送らない
- 通信に失敗したあと、同じ内容で再送するときは、同じ送信IDを使う。サーバー側で重複しない
- 投稿の種類は、色だけでなく文字のラベルでも示す
- `crypto.randomUUID` が無い環境（古いiOS Safariなど）でも、投稿できる
- `/s/<セッションID>` を配信するには、ホスティング側で、存在しないパスを `index.html` に返す設定が必要である

## テスト

```sh
npm test
npm run lint
npm run build
```

## E2Eテスト

Playwright で、デモ版（バックエンドがブラウザの中で動く）を通して確かめる。AWS は要らない。

- 実行: `npm run test:e2e`（デモ版のビルドと配信は、`playwright.config.ts` が行う）
- 対象: トップページ、参加者の投稿・一覧・いいね、管理画面のイベント一覧
- iPhone 相当の幅（iPhone 13）と、デスクトップの両方で実行する。横にはみ出していないことも確かめる
- CI は chromium だけを入れるため、WebKit は使わない。iPhone は chromium で幅と操作を再現する
- Google ログインの画面は、外部サービスのため対象外にしている
- スクリーンショットは、PR のコメントと Job Summary に画像で出る。スマホで確認できる

## 共通テーマ

dev-standards の共通テーマ（`shared/ui/bootstrap-theme.css`）を使う。共通フォントと、ダークモードの配色追従を含む。

- `src/bootstrap-theme.css` と `src/common-theme.css` は、dev-standards への symlink である。直接は編集しない
- symlink は、リポジトリのルートで `node dev-standards/scripts/bootstrap.js` を実行すると作られる。定義は `sync-manifest.local.json` にある
- フォントは、外部CDNを使わず、`@fontsource/m-plus-rounded-1c` で配信ファイルに含める
- ダークモードの切り替え（`data-bs-theme`）は、まだ組み込んでいない
