import { useEffect, useMemo, useRef, useState } from "react";

/** 残りの秒数を、「m:ss」にする。1時間以上は「h:mm:ss」 */
export function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * 制限時間の残りを出す。端末の時計はずれていることがあるため、
 * サーバーの時刻(serverNow)と受け取った時点の差から、締め切りまでの残りを求める。
 * 0になったら onExpire を1回呼ぶ(画面の状態をサーバーから取り直す)。
 */
export function TimerBadge({ deadlineAt, serverNow, onExpire }: { deadlineAt: string; serverNow: string; onExpire?: () => void }) {
  // サーバーの時刻と、端末の時刻の差。受け取った時点で固定する
  const offset = useMemo(() => Date.parse(serverNow) - Date.now(), [serverNow]);
  const remainingNow = () => (Date.parse(deadlineAt) - (Date.now() + offset)) / 1000;
  const [remaining, setRemaining] = useState(remainingNow);
  const expired = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    expired.current = false;
    setRemaining(remainingNow());
    const timer = setInterval(() => {
      const r = remainingNow();
      setRemaining(r);
      if (r <= 0 && !expired.current) {
        expired.current = true;
        onExpireRef.current?.();
      }
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineAt, offset]);

  if (remaining <= 0) {
    return (
      <span className="badge text-bg-secondary" role="status">
        ⏱ 時間になりました
      </span>
    );
  }
  return (
    <span className={`badge ${remaining <= 60 ? "text-bg-danger" : "text-bg-info"}`} role="timer" aria-label="残り時間">
      ⏱ {formatRemaining(remaining)}
    </span>
  );
}
