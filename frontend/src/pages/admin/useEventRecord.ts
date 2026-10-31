import type { AdminApi } from "../../api/admin.ts";
import type { EventRecord } from "../../api/types.ts";
import { useLoad } from "../../lib/useLoad.ts";

/** イベント1件を読む。見つからなければ、案内の文にする */
export function useEventRecord(api: AdminApi, eventId: string, describeError: (e: unknown) => string) {
  return useLoad<EventRecord>(
    async () => {
      const event = (await api.listEvents()).find((e) => e.id === eventId);
      if (!event) throw new Error("not_found");
      return event;
    },
    (e) => (e instanceof Error && e.message === "not_found" ? "イベントが見つかりません。" : describeError(e)),
    [api, eventId],
  );
}
