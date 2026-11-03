/** 1回に送る文字の上限。サーバーの上限(4000文字)に合わせる */
export const TRANSCRIPT_CHUNK_LENGTH = 4000;

/**
 * 話した内容の文字を、上限以下の塊に分ける。なるべく、改行で区切る。
 * 1行が上限より長いときは、上限で切る。空の塊は作らない。
 */
export function splitTranscript(text: string, limit = TRANSCRIPT_CHUNK_LENGTH): string[] {
  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim() !== "") chunks.push(current.trim());
    current = "";
  };
  for (const line of text.split("\n")) {
    for (const part of cutLong(line, limit)) {
      if (current !== "" && [...current].length + 1 + [...part].length > limit) flush();
      current = current === "" ? part : `${current}\n${part}`;
    }
  }
  flush();
  return chunks;
}

/** 上限より長い1行を、上限ごとに切る */
function cutLong(line: string, limit: number): string[] {
  const chars = [...line];
  if (chars.length <= limit) return [line];
  const parts: string[] = [];
  for (let i = 0; i < chars.length; i += limit) parts.push(chars.slice(i, i + limit).join(""));
  return parts;
}
