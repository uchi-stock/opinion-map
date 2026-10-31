import type { AdminApi } from "../api/admin.ts";
import type { Me } from "../api/types.ts";
import { useLoad } from "./useLoad.ts";

/** ログイン中のアカウント(オーナーか、担当のイベントだけ操作できる運営者か)。読めなかったときは、null */
export function useMe(api: AdminApi): Me | null | undefined {
  const { state } = useLoad<Me | null>(() => api.me().catch(() => null), () => "", [api]);
  if (state.status === "loading") return undefined;
  return state.status === "ready" ? state.data : null;
}
