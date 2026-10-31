import { useCallback, useEffect, useState } from "react";

/**
 * URL のハッシュ(`#post` など)で、画面の切り替えを持つ。
 * リンク(`<a href="#post">`)で開け、ブラウザの「戻る」で、もとの画面へ戻れる。
 * 閉じる(false)ときは、いまの履歴を、ハッシュなしに置き換える(投稿の完了後などに、戻る操作を増やさない)。
 */
export function useHashFlag(flag: string): [boolean, (on: boolean) => void] {
  const read = useCallback(() => typeof window !== "undefined" && window.location.hash === `#${flag}`, [flag]);
  const [on, setOn] = useState(read);

  useEffect(() => {
    const sync = () => setOn(read());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [read]);

  const set = useCallback(
    (next: boolean) => {
      if (next) {
        window.location.hash = flag;
      } else if (read()) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      setOn(next);
    },
    [flag, read],
  );

  return [on, set];
}
