import type { OpinionKind, PublicOpinion } from "../api/types.ts";
import type { BoardGroup } from "./board.ts";

/**
 * トップページに見せる、サンプルのボード。すべて架空の内容で、コードに同梱している。
 * APIは呼ばず、何も保存しない。実在の人や、実際の参加者の意見は含めない。
 */
const at = "2026-01-01T10:00:00.000Z";
const note = (id: string, kind: OpinionKind, body: string, reactionCount: number): PublicOpinion => ({
  id,
  kind,
  body,
  reactionCount,
  createdAt: at,
});

export const SAMPLE_THEME = "地域の防災を、みんなで考えるワークショップ";

export const SAMPLE_GROUPS: BoardGroup[] = [
  {
    id: "sample-shelter",
    title: "避難所のこと",
    summary: "場所の分かりにくさと、過ごしやすさの話が多く集まりました。",
    opinions: [
      note("sample-1", "experience", "去年の訓練で、避難所の場所が分からず迷った", 12),
      note("sample-2", "idea", "道の角ごとに、避難所の矢印を貼ってほしい", 9),
      note("sample-3", "question", "ペットを連れて入ってもいい？", 7),
      note("sample-4", "experience", "赤ちゃんの泣き声が気になって、夜は外にいた", 5),
      note("sample-5", "idea", "子ども連れ用の部屋を、先に決めておく", 8),
    ],
  },
  {
    id: "sample-info",
    title: "情報の届け方",
    summary: "スマホが使えない人への伝え方が、話題の中心でした。",
    opinions: [
      note("sample-6", "experience", "停電のとき、スマホの充電がすぐ切れて不安だった", 10),
      note("sample-7", "idea", "放送を、やさしい日本語でも流す", 6),
      note("sample-8", "question", "お年寄りには、誰がどう知らせる？", 11),
      note("sample-9", "idea", "近所の班ごとに、連絡の係を決めておく", 7),
    ],
  },
  {
    id: "sample-supply",
    title: "備蓄と準備",
    summary: "家庭でできる準備と、地域で持つものの分担の話です。",
    opinions: [
      note("sample-10", "idea", "各家庭の備蓄を、年に一度いっしょに点検する日を作る", 6),
      note("sample-11", "question", "地域の倉庫に、何がどれだけあるの？", 4),
      note("sample-12", "experience", "水は買ったが、トイレの備えを忘れていた", 8),
    ],
  },
  {
    id: "sample-unclassified",
    title: "どこにも入らなかった意見",
    opinions: [
      note("sample-13", "question", "外国から来た人向けの訓練はある？", 2),
      note("sample-14", "idea", "訓練のあとに、防災グッズの交換会をしたい", 1),
    ],
    unclassified: true,
  },
];
