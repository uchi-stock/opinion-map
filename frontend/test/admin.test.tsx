import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeOf } from "../src/App.tsx";
import { AdminEventEditPage } from "../src/pages/admin/AdminEventEditPage.tsx";
import { AdminEventInvitePage } from "../src/pages/admin/AdminEventInvitePage.tsx";
import { AdminEventPage } from "../src/pages/admin/AdminEventPage.tsx";
import { AdminSessionNewPage } from "../src/pages/admin/AdminSessionNewPage.tsx";
import { AdminEventsPage } from "../src/pages/admin/AdminEventsPage.tsx";
import { AdminSessionPage } from "../src/pages/admin/AdminSessionPage.tsx";
import { clearAdminToken, loadAdminToken, saveAdminToken } from "../src/lib/adminToken.ts";
import type { EventRecord, Proposal, SessionRecord } from "../src/api/types.ts";
import { json, opinion, stubFetch } from "./helpers.ts";

const TOKEN = "secret-token";
const at = "2026-01-01T00:00:00.000Z";

const event = (over: Partial<EventRecord> = {}): EventRecord => ({
  id: "e1",
  name: "カンファレンス",
  description: "説明",
  status: "active",
  createdAt: at,
  updatedAt: at,
  ...over,
});
const session = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: "s1",
  eventId: "e1",
  title: "ワークショップA",
  prompt: "いま感じていることは？",
  format: "workshop",
  status: "active",
  showOpinionsToParticipants: true,
  createdAt: at,
  updatedAt: at,
  ...over,
});

/** 運営者向けAPIの代わり。状態を持ち、呼び出しを記録する */
function fakeAdminBackend(
  initial: { events?: EventRecord[]; sessions?: SessionRecord[]; opinions?: ReturnType<typeof opinion>[]; proposals?: Proposal[] } = {},
) {
  const state = {
    proposals: [...(initial.proposals ?? [])],
    events: [...(initial.events ?? [event()])],
    sessions: [...(initial.sessions ?? [session()])],
    opinions: [...(initial.opinions ?? [])],
  };
  const calls: Array<{ method: string; path: string; body: any; auth: string | undefined }> = [];
  const mock = stubFetch((url, init) => {
    const path = url.replace(/^\/api/, "");
    const method = init?.method ?? "GET";
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body, auth: headers["authorization"] });
    if (headers["authorization"] !== `Bearer ${TOKEN}`) {
      return json({ error: { code: "unauthorized", message: "認証が必要です" } }, 401);
    }
    if (method === "GET" && path === "/events") return json({ events: state.events });
    if (method === "POST" && path === "/events") {
      const created = event({ id: `e${state.events.length + 1}`, name: body.name, description: body.description, status: "draft" });
      state.events.push(created);
      return json(created, 201);
    }
    let m = /^\/events\/([^/]+)$/.exec(path);
    if (method === "PATCH" && m) {
      state.events = state.events.map((e) => (e.id === m![1] ? { ...e, ...body, updatedAt: `${Date.now()}` } : e));
      return json(state.events.find((e) => e.id === m![1]));
    }
    m = /^\/events\/([^/]+)\/sessions$/.exec(path);
    if (method === "GET" && m) return json({ sessions: state.sessions.filter((s) => s.eventId === m![1]) });
    if (method === "POST" && m) {
      const created = session({ id: `s${state.sessions.length + 1}`, eventId: m[1]!, ...body, status: "draft" });
      state.sessions.push(created);
      return json(created, 201);
    }
    m = /^\/sessions\/([^/]+)$/.exec(path);
    if (method === "PATCH" && m) {
      state.sessions = state.sessions.map((s) => (s.id === m![1] ? { ...s, ...body, updatedAt: `${Date.now()}` } : s));
      return json(state.sessions.find((s) => s.id === m![1]));
    }
    m = /^\/events\/([^/]+)\/proposals$/.exec(path);
    if (method === "GET" && m) return json({ accepting: true, proposals: state.proposals });
    m = /^\/proposals\/([^/]+)\/decision$/.exec(path);
    if (method === "POST" && m) {
      state.proposals = state.proposals.map((p) => (p.id === m![1] ? { ...p, status: body.status } : p));
      return json({ proposal: state.proposals.find((p) => p.id === m![1]) });
    }
    m = /^\/sessions\/([^/]+)\/opinions$/.exec(path);
    if (method === "GET" && m) return json({ hidden: false, opinions: state.opinions });
    m = /^\/opinions\/([^/]+)\/moderation$/.exec(path);
    if (method === "POST" && m) {
      state.opinions =
        body.status === "deleted"
          ? state.opinions.filter((o) => o.id !== m![1])
          : state.opinions.map((o) => (o.id === m![1] ? ({ ...o, status: body.status } as typeof o) : o));
      return json({ id: m[1], status: body.status });
    }
    return json({ error: { code: "not_found", message: "ページが見つかりません" } }, 404);
  });
  return { state, calls, mock };
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("運営者のトークンの保存", () => {
  it("保存・読み出し・削除ができる", () => {
    expect(loadAdminToken()).toBeNull();
    saveAdminToken("abc");
    expect(loadAdminToken()).toBe("abc");
    clearAdminToken();
    expect(loadAdminToken()).toBeNull();
  });

  it("保存できない環境でも、例外を投げない", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    vi.stubGlobal("localStorage", broken);
    expect(() => saveAdminToken("x")).not.toThrow();
    expect(loadAdminToken()).toBeNull();
    expect(() => clearAdminToken()).not.toThrow();
  });
});

describe("運営者の画面のルーティング", () => {
  it("パスから画面を決める", () => {
    expect(routeOf("/admin")).toEqual({ page: "adminEvents" });
    expect(routeOf("/admin/")).toEqual({ page: "adminEvents" });
    expect(routeOf("/admin/events/e1")).toEqual({ page: "adminEvent", eventId: "e1" });
    expect(routeOf("/admin/events/e1/sessions/s1")).toEqual({ page: "adminSession", eventId: "e1", sessionId: "s1" });
    expect(routeOf("/admin/events/e1/edit")).toEqual({ page: "adminEventEdit", eventId: "e1" });
    expect(routeOf("/admin/events/e1/invite")).toEqual({ page: "adminEventInvite", eventId: "e1" });
    // 「new」は、テーマのIDではなく、追加の画面
    expect(routeOf("/admin/events/e1/sessions/new")).toEqual({ page: "adminSessionNew", eventId: "e1" });
    expect(routeOf("/admin/other")).toEqual({ page: "notFound" });
  });
});

describe("トップページへ戻るリンク", () => {
  it("トークンの入力前でも、トップページへ戻れる", () => {
    fakeAdminBackend();
    render(<AdminEventsPage />);
    const nav = screen.getByRole("navigation", { name: "運営者の画面のナビゲーション" });
    expect(within(nav).getByRole("link", { name: "トップページ" })).toHaveAttribute("href", "/");
  });

  it("イベント・セッションの画面でも、トップページへのリンクが出る", async () => {
    saveAdminToken(TOKEN);
    fakeAdminBackend();
    render(<AdminEventPage eventId="e1" />);
    const nav = await screen.findByRole("navigation", { name: "運営者の画面のナビゲーション" });
    expect(within(nav).getByRole("link", { name: "トップページ" })).toHaveAttribute("href", "/");
    expect(within(nav).getByRole("link", { name: /イベント一覧/ })).toBeInTheDocument();
  });
});

describe("トークンの入力", () => {
  it("トークンがなければ入力画面を出し、入力すると読み込む", async () => {
    const { calls } = fakeAdminBackend();
    const user = userEvent.setup();
    render(<AdminEventsPage />);
    expect(screen.getByLabelText("運営者のトークン")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    await user.type(screen.getByLabelText("運営者のトークン"), TOKEN);
    await user.click(screen.getByRole("button", { name: "入力する" }));
    expect(await screen.findByText("カンファレンス")).toBeInTheDocument();
    expect(loadAdminToken()).toBe(TOKEN);
    expect(calls[0]?.auth).toBe(`Bearer ${TOKEN}`);
  });

  it("誤ったトークンだと、分かりやすいエラーを出し、保存したトークンを消す", async () => {
    fakeAdminBackend();
    saveAdminToken("wrong");
    render(<AdminEventsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("トークンが正しくありません");
    expect(loadAdminToken()).toBeNull();
    expect(screen.getByLabelText("運営者のトークン")).toBeInTheDocument();
  });

  it("「トークンを消す」で、入力画面に戻る", async () => {
    fakeAdminBackend();
    saveAdminToken(TOKEN);
    const user = userEvent.setup();
    render(<AdminEventsPage />);
    await screen.findByText("カンファレンス");
    await user.click(screen.getByRole("button", { name: "トークンを消す" }));
    expect(screen.getByLabelText("運営者のトークン")).toBeInTheDocument();
    expect(loadAdminToken()).toBeNull();
  });
});

describe("イベント一覧", () => {
  beforeEach(() => saveAdminToken(TOKEN));

  it("イベントを一覧し、状態を表示する。リンクでイベントの画面へ移る", async () => {
    fakeAdminBackend({ events: [event(), event({ id: "e2", name: "別のイベント", status: "draft" })] });
    render(<AdminEventsPage />);
    const link = (await screen.findByText("別のイベント")).closest("a");
    expect(link).toHaveAttribute("href", "/admin/events/e2");
    expect(within(link!).getByText("下書き")).toBeInTheDocument();
  });

  it("イベントがないときは、案内を出す", async () => {
    fakeAdminBackend({ events: [] });
    render(<AdminEventsPage />);
    expect(await screen.findByText(/まだイベントがありません/)).toBeInTheDocument();
  });

  it("イベントを作ると、一覧に加わる（下書きで作られる）", async () => {
    const { calls } = fakeAdminBackend({ events: [] });
    const user = userEvent.setup();
    render(<AdminEventsPage />);
    await screen.findByText(/まだイベントがありません/);
    const create = screen.getByRole("button", { name: "作る" });
    expect(create).toBeDisabled();
    await user.type(screen.getByLabelText("イベント名"), "  新しいイベント ");
    await user.click(create);
    expect(await screen.findByText("新しいイベント")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ name: "新しいイベント", description: "" });
  });
});

describe("イベントの画面", () => {
  beforeEach(() => saveAdminToken(TOKEN));

  it("セッションを一覧する", async () => {
    fakeAdminBackend();
    render(<AdminEventPage eventId="e1" />);
    const link = await screen.findByRole("link", { name: /ワークショップA/ });
    expect(link).toHaveAttribute("href", "/admin/events/e1/sessions/s1");
  });

  it("招待URLとQRコードは、別の画面で、1つ出す", async () => {
    fakeAdminBackend();
    render(<AdminEventInvitePage eventId="e1" />);
    const section = await screen.findByRole("region", { name: "参加者の招待URL" });
    expect((within(section).getByLabelText("招待URL") as HTMLInputElement).value).toMatch(/\/e\/e1$/);
    expect(within(section).getByRole("img", { name: "招待URLのQRコード" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /イベント$/ })).toHaveAttribute("href", "/admin/events/e1");
  });  it("投稿を受け付けるテーマを、ラジオボタンで1つ選ぶ。下書きは選べない", async () => {
    const { calls } = fakeAdminBackend({
      events: [event({ openSessionIds: ["s1"] })],
      sessions: [session(), session({ id: "s2", title: "場B" }), session({ id: "s3", title: "下書きのテーマ", status: "draft" })],
    });
    const user = userEvent.setup();
    render(<AdminEventPage eventId="e1" />);
    const group = await screen.findByRole("group", { name: "投稿を受け付けるテーマ" });
    expect(within(group).getByRole("radio", { name: "ワークショップA" })).toBeChecked();
    expect(within(group).queryByRole("radio", { name: "下書きのテーマ" })).toBeNull();
    await user.click(within(group).getByRole("radio", { name: "場B" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ openSessionIds: ["s2"] }));
  });

  it("「すべて閉じる」を選ぶと、どのテーマにも投稿できなくなる", async () => {
    const { calls } = fakeAdminBackend({ events: [event({ openSessionIds: ["s1"] })], sessions: [session(), session({ id: "s2", title: "場B" })] });
    const user = userEvent.setup();
    render(<AdminEventPage eventId="e1" />);
    await user.click(await screen.findByRole("radio", { name: /すべて閉じる/ }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ openSessionIds: [] }));
  });

  it("選択が無いときは、公開中のすべてに投稿できる旨を出し、どれも選ばれていない", async () => {
    fakeAdminBackend({ sessions: [session(), session({ id: "s2", title: "場B" })] });
    render(<AdminEventPage eventId="e1" />);
    const group = await screen.findByRole("group", { name: "投稿を受け付けるテーマ" });
    expect(within(group).getByText(/公開中のテーマすべてに投稿できます/)).toBeInTheDocument();
    for (const radio of within(group).getAllByRole("radio")) expect(radio).not.toBeChecked();
  });

  it("イベントのページは、説明を固定で表示し、フォームやQRを並べない。編集・招待URL・テーマ追加へのリンクを置く", async () => {
    fakeAdminBackend({ events: [event({ description: "一行目\n二行目" })] });
    render(<AdminEventPage eventId="e1" />);
    const info = await screen.findByRole("region", { name: "イベントの情報" });
    expect(within(info).getByRole("heading", { name: "カンファレンス" })).toBeInTheDocument();
    expect(within(info).getByText(/一行目/)).toBeInTheDocument();
    expect(within(info).getByRole("link", { name: "編集" })).toHaveAttribute("href", "/admin/events/e1/edit");
    expect(within(info).getByRole("link", { name: "招待URLとQR" })).toHaveAttribute("href", "/admin/events/e1/invite");
    expect(screen.getByRole("link", { name: "テーマを追加" })).toHaveAttribute("href", "/admin/events/e1/sessions/new");
    // 編集のフォーム、招待URL、QR、テーマの追加フォームは、このページに出さない
    expect(screen.queryByLabelText("イベント名")).toBeNull();
    expect(screen.queryByRole("img", { name: "招待URLのQRコード" })).toBeNull();
    expect(screen.queryByRole("form", { name: "セッションを作る" })).toBeNull();
  });

  it("説明が無いときは、その旨を出す。公開前のイベントには、状態の案内を出す", async () => {
    fakeAdminBackend({ events: [event({ description: "", status: "draft" })] });
    render(<AdminEventPage eventId="e1" />);
    expect(await screen.findByText("説明はありません。")).toBeInTheDocument();
    expect(screen.getByText(/編集の画面で、状態を切り替えます/)).toBeInTheDocument();
  });

  it("議題の提案を受け付ける設定を切り替える", async () => {
    const { calls } = fakeAdminBackend();
    const user = userEvent.setup();
    render(<AdminEventPage eventId="e1" />);
    await user.click(await screen.findByLabelText("議題の提案を受け付ける"));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ acceptingProposals: true }));
  });

  it("提案を承認・却下・統合できる。判断済みには、ボタンを出さない", async () => {
    const proposal = (over: Partial<Proposal>): Proposal => ({
      id: "p1",
      title: "朝の議題",
      description: "",
      status: "pending",
      reactionCount: 3,
      createdAt: at,
      ...over,
    });
    const { calls } = fakeAdminBackend({
      proposals: [proposal({}), proposal({ id: "p2", title: "統合したい議題" }), proposal({ id: "p3", title: "済み", status: "approved" })],
    });
    const user = userEvent.setup();
    render(<AdminEventPage eventId="e1" />);
    await user.click(await screen.findByRole("button", { name: "朝の議題を承認する" }));
    await waitFor(() => expect(calls.find((c) => c.path === "/proposals/p1/decision")?.body).toEqual({ status: "approved" }));
    await user.selectOptions(await screen.findByLabelText("統合したい議題の統合先"), "s1");
    await user.click(screen.getByRole("button", { name: "統合したい議題を統合する" }));
    await waitFor(() => expect(calls.find((c) => c.path === "/proposals/p2/decision")?.body).toEqual({ status: "merged", intoSessionId: "s1" }));
    expect(screen.queryByRole("button", { name: "済みを承認する" })).toBeNull();
  });

  it("存在しないイベントでは、見つからない旨を出す", async () => {
    fakeAdminBackend();
    render(<AdminEventPage eventId="nope" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("イベントが見つかりません");
  });

  it("編集の画面で、状態を切り替えると、すぐに保存する", async () => {
    const { calls, state } = fakeAdminBackend({ events: [event({ status: "draft" })] });
    const user = userEvent.setup();
    render(<AdminEventEditPage eventId="e1" />);
    await user.selectOptions(await screen.findByLabelText("状態"), "active");
    await waitFor(() => expect(state.events[0]?.status).toBe("active"));
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "active" });
  });  it("編集の画面で、名前と説明を保存できる", async () => {
    const { calls } = fakeAdminBackend();
    const user = userEvent.setup();
    render(<AdminEventEditPage eventId="e1" />);
    const name = await screen.findByLabelText("イベント名");
    await user.clear(name);
    await user.type(name, "改名したイベント");
    await user.click(screen.getByRole("button", { name: "保存する" }));
    expect(await screen.findByText("保存しました。")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ name: "改名したイベント" });
  });

  it("編集の画面は、存在しないイベントでは、見つからない旨を出す", async () => {
    fakeAdminBackend();
    render(<AdminEventEditPage eventId="nope" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("イベントが見つかりません");
  });  it("テーマの追加は、別の画面。問いが空だと作れず、作ると、そのテーマのページへ移る", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const { calls } = fakeAdminBackend({ sessions: [] });
    const user = userEvent.setup();
    render(<AdminSessionNewPage eventId="e1" />);
    const form = await screen.findByRole("form", { name: "セッションを作る" });
    const submit = within(form).getByRole("button", { name: "作る" });
    await user.type(within(form).getByLabelText("セッション名"), "新セッション");
    expect(submit).toBeDisabled();
    await user.type(within(form).getByLabelText("参加者への問い"), "どう思いますか");
    await user.selectOptions(within(form).getByLabelText("形式"), "ost");
    await user.click(within(form).getByLabelText("投稿された意見を、参加者にも見せる"));
    await user.click(submit);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/admin/events/e1/sessions/s1"));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      title: "新セッション",
      prompt: "どう思いますか",
      format: "ost",
      showOpinionsToParticipants: false,
    });
  });});

describe("セッションの画面", () => {
  beforeEach(() => saveAdminToken(TOKEN));

  it("参加者のURLとQRコードを表示する", async () => {
    fakeAdminBackend();
    render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    const input = (await screen.findByLabelText("参加者のURL")) as HTMLInputElement;
    expect(input.value).toBe(`${window.location.origin}/s/s1`);
    const qr = screen.getByRole("img", { name: "参加者のURLのQRコード" });
    expect(qr.querySelectorAll("rect").length).toBeGreaterThan(100);
  });

  it("コピーのボタンで、URLをクリップボードに写す", async () => {
    fakeAdminBackend();
    const user = userEvent.setup();
    render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    await screen.findByLabelText("参加者のURL");
    await user.click(screen.getByRole("button", { name: "コピー" }));
    expect(await screen.findByText("コピーしました。")).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/s/s1`);
  });

  it("クリップボードが使えない環境では、手でコピーする案内を出す", async () => {
    fakeAdminBackend();
    const user = userEvent.setup();
    render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    await screen.findByLabelText("参加者のURL");
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    await user.click(screen.getByRole("button", { name: "コピー" }));
    expect(await screen.findByText(/長押ししてコピー/)).toBeInTheDocument();
  });

  it("公開中でないときは、参加者に見えない旨を警告する", async () => {
    fakeAdminBackend({ sessions: [session({ status: "draft" })] });
    render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    expect(await screen.findByText(/両方とも「公開中」のときだけ/)).toBeInTheDocument();
  });

  it("イベントもセッションも公開中なら、警告を出さない", async () => {
    fakeAdminBackend();
    render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    await screen.findByLabelText("参加者のURL");
    expect(screen.queryByText(/両方とも「公開中」のときだけ/)).toBeNull();
  });

  it("投稿の件数と、意見のカードを表示する（新しい順）", async () => {
    fakeAdminBackend({
      opinions: [opinion("o1", "古い意見", "idea", "2026-01-01T00:00:00.000Z"), opinion("o2", "新しい意見", "question", "2026-01-01T00:05:00.000Z")],
    });
    render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    expect(await screen.findByText("投稿された意見（2件）")).toBeInTheDocument();
    const cards = screen.getAllByTestId("opinion-card");
    expect(cards[0]).toHaveTextContent("新しい意見");
    expect(cards[1]).toHaveTextContent("古い意見");
  });

  it("状態を「終了」にすると、すぐに保存する", async () => {
    const { calls } = fakeAdminBackend();
    const user = userEvent.setup();
    render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    await user.selectOptions(await screen.findByLabelText("状態"), "closed");
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH" && c.body?.status === "closed")).toBe(true));
  });

  it("意見を見せる設定を、切り替えて保存できる", async () => {
    const { calls } = fakeAdminBackend();
    const user = userEvent.setup();
    render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    await user.click(await screen.findByLabelText("投稿された意見を、参加者にも見せる"));
    await user.click(screen.getByRole("button", { name: "保存する" }));
    await screen.findByText("保存しました。");
    expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ showOpinionsToParticipants: false });
  });

  it("存在しないセッションでは、見つからない旨を出す", async () => {
    fakeAdminBackend();
    render(<AdminSessionPage eventId="e1" sessionId="nope" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("セッションが見つかりません");
  });

  it("不適切な投稿を、非表示にして、表示に戻せる", async () => {
    const { calls } = fakeAdminBackend({ opinions: [opinion("o1", "問題のある意見")] });
    const user = userEvent.setup();
    render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    await user.click(await screen.findByRole("button", { name: "非表示にする" }));
    expect(await screen.findByText("非表示中")).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/opinions/o1/moderation")?.body).toEqual({ status: "hidden" });
    await user.click(screen.getByRole("button", { name: "表示に戻す" }));
    await waitFor(() => expect(screen.queryByText("非表示中")).toBeNull());
    expect(calls.filter((c) => c.path === "/opinions/o1/moderation").at(-1)?.body).toEqual({ status: "active" });
  });

  it("削除は、確認のあとにだけ実行する", async () => {
    const { calls } = fakeAdminBackend({ opinions: [opinion("o1", "消したい意見")] });
    const user = userEvent.setup();
    render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    await user.click(await screen.findByRole("button", { name: "削除する" }));
    expect(calls.some((c) => c.path.endsWith("/moderation"))).toBe(false);
    expect(screen.getByText(/元に戻せません/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "削除する" }));
    await waitFor(() => expect(screen.queryByText("消したい意見")).toBeNull());
    expect(calls.find((c) => c.path.endsWith("/moderation"))?.body).toEqual({ status: "deleted" });
  });

  it("意見の本文に含まれるスクリプトは、実行されない", async () => {
    fakeAdminBackend({ opinions: [opinion("o1", `<img src=x onerror="alert(1)">`)] });
    const { container } = render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    expect(await screen.findByText(`<img src=x onerror="alert(1)">`)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
