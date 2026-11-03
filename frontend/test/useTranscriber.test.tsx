import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTranscriber } from "../src/lib/useTranscriber.ts";

/** ブラウザの音声認識の代わり。start() のたびに、1回分の認識を作り、テストから結果やエラーを送る */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  interimResults = false;
  onresult: ((e: { results: { transcript: string }[][] }) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {}
  say(text: string) {
    this.onresult?.({ results: [[{ transcript: text }]] });
    this.onend?.();
  }
  fail(error: string) {
    this.onerror?.({ error });
    this.onend?.();
  }
  silent() {
    this.onend?.();
  }
}

function Probe({ onText }: { onText: (t: string) => void }) {
  const t = useTranscriber(onText);
  return (
    <div>
      <span data-testid="state">{t.supported ? (t.recording ? "recording" : "idle") : "unsupported"}</span>
      <span data-testid="error">{t.error ?? ""}</span>
      <button onClick={t.start}>start</button>
      <button onClick={t.stop}>stop</button>
    </div>
  );
}

const last = () => FakeRecognition.instances[FakeRecognition.instances.length - 1]!;
const tick = (ms = 300) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const click = (name: string) => act(() => void screen.getByText(name).click());

describe("useTranscriber", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeRecognition.instances = [];
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  });

  it("対応していない環境では、何もしない", () => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    render(<Probe onText={() => {}} />);
    expect(screen.getByTestId("state")).toHaveTextContent("unsupported");
    click("start");
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it("話すたびに文字を渡し、終わったら聞き直して続ける。とめると、聞き直さない", async () => {
    const heard: string[] = [];
    render(<Probe onText={(t) => heard.push(t)} />);
    click("start");
    expect(screen.getByTestId("state")).toHaveTextContent("recording");
    expect(last().lang).toBe("ja-JP");
    act(() => last().say("  こんにちは  "));
    await tick();
    expect(FakeRecognition.instances).toHaveLength(2);
    act(() => last().say("二つ目"));
    expect(heard).toEqual(["こんにちは", "二つ目"]);
    click("stop");
    await tick();
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
    expect(FakeRecognition.instances).toHaveLength(2);
  });

  it("発話がなくても聞き直す。長く続くと、とめて知らせる", async () => {
    render(<Probe onText={() => {}} />);
    click("start");
    for (let i = 0; i < 25; i++) {
      act(() => last().silent());
      await tick();
    }
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
    expect(screen.getByTestId("error")).toHaveTextContent("しばらく話し声がなかった");
  });

  it("no-speech は聞き直す。許可がないなどのエラーは、とめて知らせる", async () => {
    render(<Probe onText={() => {}} />);
    click("start");
    act(() => last().fail("no-speech"));
    await tick();
    expect(screen.getByTestId("state")).toHaveTextContent("recording");
    expect(FakeRecognition.instances).toHaveLength(2);
    act(() => last().fail("not-allowed"));
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
    expect(screen.getByTestId("error")).toHaveTextContent("マイクの使用が許可されていません");
    click("start");
    act(() => last().fail("something-else"));
    expect(screen.getByTestId("error")).toHaveTextContent("音声認識でエラーが起きました");
  });

  it("画面を離れたら、聞き直しをやめる", async () => {
    const { unmount } = render(<Probe onText={() => {}} />);
    click("start");
    act(() => last().say("あ"));
    unmount();
    await tick();
    expect(FakeRecognition.instances).toHaveLength(1);
  });
});
