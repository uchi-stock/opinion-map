# frontend

参加者向けの画面である。React 19、Vite、TypeScript、Bootstrap 5.3で作っている。

## 画面

| パス | 内容 |
| --- | --- |
| `/` | トップページ。キャッチコピー、バージョン、更新日時 |
| `/s/<テーマID>` | 参加者の画面。問い、投稿についての案内、投稿フォーム、意見のカード |
| `/admin` | 運営者の画面。イベントの一覧と作成。最初に運営者のトークンを入力する |
| `/admin/events/<イベントID>` | イベントの設定、状態の切り替え、テーマの一覧と作成 |
| `/admin/events/<イベントID>/sessions/<テーマID>` | テーマの設定、状態の切り替え、参加者のURLとQRコード、投稿された意見 |

## ローカルで動かす

バックエンドを先に起動する。

```sh
cd backend && npm ci && npm run dev
```

起動時に表示される「テーマID」を控える。続けて、フロントエンドを起動する。

```sh
cd frontend
npm ci
npm run dev
```

ブラウザで `http://localhost:5173/s/<テーマID>` を開く。
運営者の画面は、`http://localhost:5173/admin` である。
ローカルのバックエンドの運営者トークンは、起動時に表示される（初期値は `local-dev-admin-token`）。
`/api` へのリクエストは、バックエンド（`http://localhost:8787`）へ中継される。
中継先は、環境変数 `VITE_DEV_API_TARGET` で変えられる。

## デモ版

サーバーなしで、ブラウザの中だけで動くデモ版を作れる。
本物のバックエンドのコードを、そのままブラウザで動かす。

- データは、見る人のブラウザの `localStorage` に保存する。他の人とは共有されない
- 運営者のトークンは「demo」で、入力済みの状態になる
- はじめに、公開済みのイベントとテーマ、サンプルの意見を作る
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
- `/s/<テーマID>` を配信するには、ホスティング側で、存在しないパスを `index.html` に返す設定が必要である

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

## PWA（ホーム画面に追加）

ホーム画面に追加でき、更新があれば、再読み込みを促す。dev-standards の共通の仕組み（`docs/service-worker-update-pattern.md`）を使う。

- アイコンは、`public/` にある。付箋が3枚重なった絵で、`python3 frontend/scripts/make-icons.py` で作り直せる（Pillow が要る）
- `public/manifest.json` が、名前、アイコン、起動のURLを定める。`apple-touch-icon` は、iOS Safari のため、`index.html` で別に指定している
- Service Worker（`public/sw.js`）は、dev-standards への symlink である。設定は `public/sw-config.js` にある
  - ページ本体は、ネットワーク優先にする。古い画面が出続けないようにするため
  - `/api` は、キャッシュしない。意見の一覧や人数が、古いまま返らないようにするため
  - キャッシュの戦略を変えたら、`cacheVersion` を上げる
- 新しい版を見つけると、画面の下に「新しいバージョンがあります」と「更新する」を出す。入力中の内容を壊さないよう、自動では再読み込みしない
- 開発サーバーとデモ版では、Service Worker を登録しない（キャッシュが邪魔になるため）

## ボタンの絵文字

ボタンは、文字でなく、絵文字1文字で示す。見た目はすっきりするが、読み上げの名前は、必ず付ける。

- 名前は `aria-label` に書き、`title` にも同じものを書く。絵文字の見た目だけに頼らない
- 切り替わるボタン（送信中、いいね済みなど）は、名前も一緒に切り替える
- 見た目は、`icon-btn` のクラスで揃える（`src/app.css`）
- メニューの入口は、絵文字の下に、短い名前を添えたタイルにする（`menu-tile`）

| 絵文字 | 意味 | 絵文字 | 意味 |
| --- | --- | --- | --- |
| 🏠 | トップページ | ⬅️ | 1つ上の画面へ戻る |
| 🚪 | ログアウト | 🔄 | 読み込み直す |
| 📨 | 投稿する、提案する | ⏳ | 送信中、作成中 |
| ➕ | 作る、追加する | ➖ | 外す |
| 💾 | 保存する | ✖️ | やめる |
| ✏️ | 編集する | 🗑️ | 削除する |
| 🙈 / 👁️ | 非表示にする / 表示に戻す | 🤍 / ❤️ | いいね / いいね済み |
| ☰ / 🗒️ | 一覧 / ボード | 📄 / ✨ | 原文 / 要約（AI） |
| ✅ / ❌ / 🔀 | 承認 / 却下 / 統合 | 🔍 / 🔁 | 分析する / もう一度 |
| 📋 | コピーする | 🔗 | リンクを発行する |
| 👀 | 参加者の画面を見る | 🛠️ | 運営者の画面 |
