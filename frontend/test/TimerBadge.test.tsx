import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRemaining, TimerBadge } from "../src/components/TimerBadge.tsx";

describe("formatRemaining", () => {
  it("m:ss と h:mm:ss で出す", () => {
    expect(formatRemaining(65)).toBe("1:05");
    expect(formatRemaining(0.2)).toBe("0:01");
    expect(formatRemaining(3725)).toBe("1:02:05");
    expect(formatRemaining(-3)).toBe("0:00");
  });
});

describe("TimerBadge", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("サーバーの時刻との差で残りを出し、0で onExpire を1回呼ぶ", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const onExpire = vi.fn();
    // 端末の時計は、サーバーより1時間遅れている
    const serverNow = "2026-01-01T01:00:00.000Z";
    render(<TimerBadge deadlineAt="2026-01-01T01:00:03.000Z" serverNow={serverNow} onExpire={onExpire} />);
    expect(screen.getByRole("timer")).toHaveTextContent("0:03");
    act(() => void vi.advanceTimersByTime(2000));
    expect(screen.getByRole("timer")).toHaveTextContent("0:01");
    act(() => void vi.advanceTimersByTime(2000));
    expect(screen.getByText(/時間になりました/)).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(5000));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
