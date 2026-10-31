import { useState } from "react";

/** Google の画像の配信元(https)だけを <img> に使う。サーバーでも検証しているが、画面でも守る */
export function isSafePicture(url: string | undefined): url is string {
  return !!url && /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.googleusercontent\.com\/[^\s"'<>]*$/.test(url);
}

const COLORS = ["#6c8ebf", "#82b366", "#d6a54a", "#b85450", "#9673a6", "#5f9ea0", "#c27ba0", "#7a8b99"];

function colorOf(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return COLORS[h % COLORS.length]!;
}

interface Props {
  /** メール。無いとき(トークン)は、汎用の表示 */
  email?: string | undefined;
  picture?: string | undefined;
  size?: number;
  /** 読み上げ用の名前 */
  label: string;
}

/**
 * アカウントのアイコン。プロフィール画像があれば画像、無ければ(または読めなければ)メールの頭文字の丸。
 * 画像は、リファラーを送らない(アクセス元の画面のURLを、Google に知らせないため)。
 */
export function Avatar({ email, picture, size = 32, label }: Props) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: size * 0.45 };
  if (isSafePicture(picture) && !broken) {
    return (
      <img
        src={picture}
        alt={label}
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className="rounded-circle flex-shrink-0"
        style={{ objectFit: "cover" }}
        onError={() => setBroken(true)}
      />
    );
  }
  const initial = email ? email.trim().charAt(0).toUpperCase() : "";
  return (
    <span
      role="img"
      aria-label={label}
      className="rounded-circle d-inline-flex align-items-center justify-content-center flex-shrink-0 text-white fw-bold"
      style={{ ...style, backgroundColor: email ? colorOf(email) : "#7a8b99" }}
    >
      {initial || "?"}
    </span>
  );
}
