import { useCallback, useEffect, useRef, useState } from "react";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition.js";

/** 話し声が続かないまま、この回数だけ聞き直したら、録音をとめる(つけっぱなしを防ぐ) */
const MAX_IDLE_ROUNDS = 20;
/** 聞き直すまでの短い間 */
const RESTART_DELAY_MS = 200;

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "マイクの使用が許可されていません。ブラウザの設定で、許可してください。",
  "service-not-allowed": "この端末では、音声認識を使えません。",
  network: "音声認識のサービスに接続できません。電波の良い場所で、もう一度お試しください。",
  "audio-capture": "マイクが見つかりません。",
};

/**
 * 話した内容を、端末の中で文字にする。音声は、サーバーに送らない。
 * 共通の音声認識フックは、1回の発話ごとに終わるため、録音中は、終わるたびに聞き直して続ける。
 * 画面を消すと止まるため、録音中は画面のスリープを防ぐのは、使う側(useWakeLock)が行う。
 * 非対応の環境(supported が false)では、何もしない。
 */
export function useTranscriber(onText: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const idleRounds = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startRef = useRef<() => void>(() => {});

  const stop = useCallback(() => {
    active.current = false;
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
    setRecording(false);
  }, []);

  // 聞き終わったら、録音中なら、少し間を置いて聞き直す
  const next = useCallback(() => {
    if (!active.current) return;
    if (idleRounds.current >= MAX_IDLE_ROUNDS) {
      setError("しばらく話し声がなかったため、録音をとめました。");
      stop();
      return;
    }
    timer.current = setTimeout(() => startRef.current(), RESTART_DELAY_MS);
  }, [stop]);

  const { isSupported, start: startOnce } = useSpeechRecognition({
    onResult: (transcript) => {
      idleRounds.current = 0;
      const text = transcript.trim();
      if (text !== "") onText(text);
      next();
    },
    onNoResult: () => {
      idleRounds.current += 1;
      next();
    },
    onError: (code) => {
      if (code === "no-speech" || code === "aborted") {
        idleRounds.current += 1;
        next();
        return;
      }
      setError(ERROR_MESSAGES[code] ?? "音声認識でエラーが起きました。録音をとめました。");
      stop();
    },
  });
  startRef.current = startOnce;

  const start = useCallback(() => {
    if (!isSupported || active.current) return;
    setError(null);
    idleRounds.current = 0;
    active.current = true;
    setRecording(true);
    startOnce();
  }, [isSupported, startOnce]);

  // 画面を離れたら、聞き直しをやめる
  useEffect(() => stop, [stop]);

  return { supported: isSupported, recording, error, start, stop };
}
