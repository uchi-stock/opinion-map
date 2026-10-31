import { useEffect, useRef } from "react";

/**
 * 画面が見えている間だけ、一定の間隔で呼ぶ。見えなくなったら止め、見えるようになったら、すぐに1回呼ぶ。
 * iOS Safari は、裏のタブを止めるため、タイマーだけに頼らず、表示に戻った合図(visibilitychange)でも更新する。
 */
export function useVisiblePolling(callback: () => void, intervalMs: number): void {
  const latest = useRef(callback);
  latest.current = callback;

  useEffect(() => {
    if (typeof document === "undefined") return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      timer = setInterval(() => latest.current(), intervalMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        latest.current();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
}
