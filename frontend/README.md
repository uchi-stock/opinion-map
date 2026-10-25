# frontend

参加者向けの画面である。React 19、Vite、TypeScript、Bootstrap 5.3で作っている。

## 画面

| パス | 内容 |
| --- | --- |
| `/` | トップページ。キャッチコピー、バージョン、更新日時 |
| `/s/<セッションID>` | 参加者の画面。問い、投稿についての案内、投稿フォーム、意見のカード |

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
`/api` へのリクエストは、バックエンド（`http://localhost:8787`）へ中継される。
中継先は、環境変数 `VITE_DEV_API_TARGET` で変えられる。

## 環境変数

| 名前 | 用途 | 初期値 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | ビルドしたアプリが呼ぶAPIのURL | `/api` |

## 設計上の決まり

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
