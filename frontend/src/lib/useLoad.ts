import { useCallback, useEffect, useRef, useState } from "react";

export type Loaded<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

/** 読み込みの状態を持つ。deps が変わると、読み込み直す */
export function useLoad<T>(load: () => Promise<T>, describeError: (e: unknown) => string, deps: unknown[]) {
  const [state, setState] = useState<Loaded<T>>({ status: "loading" });
  const latest = useRef({ load, describeError });
  latest.current = { load, describeError };

  const reload = useCallback(async () => {
    try {
      const data = await latest.current.load();
      setState({ status: "ready", data });
    } catch (e) {
      setState({ status: "error", message: latest.current.describeError(e) });
    }
  }, []);

  useEffect(() => {
    setState({ status: "loading" });
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { state, reload };
}
