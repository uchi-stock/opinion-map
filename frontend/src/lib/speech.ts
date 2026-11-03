/** この端末のブラウザで、音声認識を使えるか(フィーチャー検出)。使えなければ、録音の入口を出さない */
export function isSpeechSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}
