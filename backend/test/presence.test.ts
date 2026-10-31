import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.js";

const device = (n: number) => `device-${String(n).padStart(3, "0")}-aaaaaaaaaaaaaaaa`;

describe("見ている人数の目安", () => {
  // 時刻は、呼ぶたびに1分進む(helpers)。90秒の窓には、直近の1〜2回の呼び出ししか入らない。
  // そのため、時刻を固定して数える
  async function setup() {
    const clock = { ms: Date.UTC(2026, 0, 1, 0, 0, 0) };
    const t = createTestApp({ now: () => new Date(clock.ms) });
    const { eventId, sessionId } = await t.openSession();
    const ping = (n: number) => t.call("POST", `/sessions/${sessionId}/presence`, { body: { deviceId: device(n) } });
    const viewers = async () => {
      const sessions = (await t.call("GET", `/events/${eventId}/public`)).json.sessions as { id: string; viewers?: number | "few" }[];
      return sessions.find((s) => s.id === sessionId)?.viewers;
    };
    return { ...t, clock, sessionId, eventId, ping, viewers };
  }

  it("少人数のときは、人数を出さず、少数とだけ示す", async () => {
    const t = await setup();
    expect(await t.viewers()).toBe("few");
    for (let i = 1; i <= 4; i++) await t.ping(i);
    expect(await t.viewers()).toBe("few");
  });

  it("同じ端末は、何回知らせても1台。5台以上で、5人きざみの目安になる", async () => {
    const t = await setup();
    for (let i = 1; i <= 7; i++) {
      await t.ping(i);
      await t.ping(i);
    }
    expect(await t.viewers()).toBe(5);
    for (let i = 8; i <= 12; i++) await t.ping(i);
    expect(await t.viewers()).toBe(10);
  });

  it("しばらく知らせてこない端末は、数えない", async () => {
    const t = await setup();
    for (let i = 1; i <= 6; i++) await t.ping(i);
    expect(await t.viewers()).toBe(5);
    t.clock.ms += 91 * 1000;
    expect(await t.viewers()).toBe("few");
  });

  it("端末のIDが正しくないと、400。存在しないセッションは404", async () => {
    const t = await setup();
    expect((await t.call("POST", `/sessions/${t.sessionId}/presence`, { body: { deviceId: "short" } })).statusCode).toBe(400);
    expect((await t.call("POST", `/sessions/nope/presence`, { body: { deviceId: device(1) } })).statusCode).toBe(404);
  });

  it("端末のIDそのものは、保存されない(ハッシュだけ)", async () => {
    const t = await setup();
    await t.ping(1);
    const kinds = JSON.stringify(await t.call("GET", `/events/${t.eventId}/public`));
    expect(kinds).not.toContain(device(1));
  });
});
