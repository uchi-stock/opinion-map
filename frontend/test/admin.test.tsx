import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeOf } from "../src/App.tsx";
import { AdminEventEditPage } from "../src/pages/admin/AdminEventEditPage.tsx";
import { AdminEventInvitePage } from "../src/pages/admin/AdminEventInvitePage.tsx";
import { AdminAdminsPage } from "../src/pages/admin/AdminAdminsPage.tsx";
import { AdminEventNewPage } from "../src/pages/admin/AdminEventNewPage.tsx";
import { AdminEventPage } from "../src/pages/admin/AdminEventPage.tsx";
import { AdminNotesPage, AdminProposalsPage, AdminUsagePage } from "../src/pages/admin/AdminEventSubPages.tsx";
import { AdminSessionNewPage } from "../src/pages/admin/AdminSessionNewPage.tsx";
import { AdminEventsPage } from "../src/pages/admin/AdminEventsPage.tsx";
import { AdminSessionPage } from "../src/pages/admin/AdminSessionPage.tsx";
import { AdminSessionEditPage, AdminSessionNotesPage } from "../src/pages/admin/AdminSessionSubPages.tsx";
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
  initial: {
    events?: EventRecord[];
    sessions?: SessionRecord[];
    opinions?: ReturnType<typeof opinion>[];
    proposals?: Proposal[];
    me?: Record<string, unknown>;
  } = {},
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
    if (method === "GET" && path === "/me") return json(initial.me ?? { role: "owner" });
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
  // 意見の管理の画面(#manage)の状態を、次のテストに持ち越さない
  window.history.replaceState(null, "", "/");
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
    expect(routeOf("/admin/events/new")).toEqual({ page: "adminEventNew" });
    expect(routeOf("/admin/admins")).toEqual({ page: "adminAdmins" });
    expect(routeOf("/admin/events/e1/proposals")).toEqual({ page: "adminEventProposals", eventId: "e1" });
    expect(routeOf("/admin/events/e1/notes")).toEqual({ page: "adminEventNotes", eventId: "e1" });
    expect(routeOf("/admin/events/e1/usage")).toEqual({ page: "adminEventUsage", eventId: "e1" });
    expect(routeOf("/admin/events/e1/edit")).toEqual({ page: "adminEventEdit", eventId: "e1" });
    expect(routeOf("/admin/events/e1/invite")).toEqual({ page: "adminEventInvite", eventId: "e1" });
    // 「new」は、テーマのIDではなく、追加の画面
    expect(routeOf("/admin/events/e1/sessions/new")).toEqual({ page: "adminSessionNew", eventId: "e1" });
    expect(routeOf("/admin/events/e1/sessions/s1/edit")).toEqual({ page: "adminSessionEdit", eventId: "e1", sessionId: "s1" });
    expect(routeOf("/admin/events/e1/sessions/s1/notes")).toEqual({ page: "adminSessionNotes", eventId: "e1", sessionId: "s1" });
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

  it("イベント・テーマの画面でも、トップページへのリンクが出る", async () => {
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

  it("右上のアイコンをタップして「ログアウト」すると、入力画面に戻る", async () => {
    fakeAdminBackend();
    saveAdminToken(TOKEN);
    const user = userEvent.setup();
    render(<AdminEventsPage />);
    await screen.findByText("カンファレンス");
    await user.click(screen.getByRole("button", { name: "アカウントのメニュー" }));
    await user.click(screen.getByRole("menuitem", { name: "ログアウト" }));
    expect(screen.getByLabelText("運営者のトークン")).toBeInTheDocument();
    expect(loadAdminToken()).toBeNull();
  });
});

describe("アカウントのアイコン", () => {
  beforeEach(() => saveAdminToken(TOKEN));

  it("アイコンは、ナビゲーションの右側(トップページのボタンの右)にあり、メニューは右揃えで開く", async () => {
    fakeAdminBackend({ me: { role: "owner", email: "alice@example.com" } });
    const user = userEvent.setup();
    render(<AdminEventsPage />);
    const nav = await screen.findByRole("navigation", { name: "運営者の画面のナビゲーション" });
    const top = within(nav).getByRole("link", { name: "トップページ" });
    const account = within(nav).getByRole("button", { name: "アカウントのメニュー" });
    // 同じ右側のまとまりで、トップページのボタンの次(右)にある。左側には、戻る・見出しだけ
    expect(top.parentElement).toBe(account.parentElement?.parentElement);
    expect(top.nextElementSibling).toBe(account.parentElement);
    expect(nav.firstElementChild).not.toBe(top.parentElement);
    await user.click(account);
    expect(within(nav).getByRole("menu").className).toContain("end-0");
    expect(within(nav).getByRole("menu").className).not.toContain("start-0");
  });

  it("ログイン中のメールの頭文字がアイコンになり、タップするとメールが出る。もう一度タップすると閉じる", async () => {
    fakeAdminBackend({ me: { role: "owner", email: "alice@example.com" } });
    const user = userEvent.setup();
    render(<AdminEventsPage />);
    const button = await screen.findByRole("button", { name: "アカウントのメニュー" });
    expect(await within(button).findByText("A")).toBeInTheDocument();
    expect(screen.queryByText("alice@example.com")).toBeNull();
    await user.click(button);
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    await user.click(button);
    expect(screen.queryByText("alice@example.com")).toBeNull();
  });

  it("プロフィール画像があれば画像を出す。リファラーは送らない。Google 以外のURLは使わない", async () => {
    fakeAdminBackend({ me: { role: "owner", email: "alice@example.com", picture: "https://lh3.googleusercontent.com/a/abc" } });
    const { unmount } = render(<AdminEventsPage />);
    // 読み込み前は頭文字の丸(同じ役割)。画像に切り替わるまで待つ
    await waitFor(() => expect(screen.getByRole("img", { name: "ログイン中のアカウント" }).tagName).toBe("IMG"));
    const img = screen.getByRole("img", { name: "ログイン中のアカウント" });
    expect(img).toHaveAttribute("src", "https://lh3.googleusercontent.com/a/abc");
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    unmount();

    fakeAdminBackend({ me: { role: "owner", email: "bob@example.com", picture: "https://evil.example.com/x.png" } });
    render(<AdminEventsPage />);
    const button = await screen.findByRole("button", { name: "アカウントのメニュー" });
    expect(await within(button).findByText("B")).toBeInTheDocument();
    expect(within(button).getByRole("img").tagName).toBe("SPAN");
  });

  it("メールが無い(トークンでのログイン)ときは、汎用の表示にする", async () => {
    fakeAdminBackend({ me: { role: "owner" } });
    const user = userEvent.setup();
    render(<AdminEventsPage />);
    await user.click(await screen.findByRole("button", { name: "アカウントのメニュー" }));
    expect(screen.getByText("トークンでログイン中")).toBeInTheDocument();
  });

  it("アカウントの情報を読めなくても、ログアウトできる", async () => {
    const mock = fakeAdminBackend();
    const original = mock.mock.getMockImplementation()!;
    mock.mock.mockImplementation(async (url, init) =>
      String(url).endsWith("/me") ? json({ error: { code: "server_error", message: "失敗" } }, 500) : original(url, init),
    );
    const user = userEvent.setup();
    render(<AdminEventsPage />);
    await user.click(await screen.findByRole("button", { name: "アカウントのメニュー" }));
    expect(screen.getByRole("menuitem", { name: "ログアウト" })).toBeInTheDocument();
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

  it("作った管理者のアイコンと、作成日(日本時間)を出す。作成者が不明の以前のイベントは、作成日だけ", async () => {
    fakeAdminBackend({
      events: [
        event({ id: "e1", name: "新しいイベント", createdBy: "alice@example.com", createdAt: "2026-10-31T16:30:00.000Z" }),
        event({ id: "e2", name: "トークンで作った", createdBy: "(token)" }),
        event({ id: "e3", name: "以前のイベント" }),
      ],
    });
    render(<AdminEventsPage />);
    const row = (await screen.findByText("新しいイベント")).closest("a")!;
    expect(within(row).getByText("作成日 2026/11/1")).toBeInTheDocument();
    expect(within(row).getByRole("img", { name: "作成者: alice@example.com" })).toHaveTextContent("A");
    const token = screen.getByText("トークンで作った").closest("a")!;
    expect(within(token).getByRole("img", { name: "作成者: トークン" })).toBeInTheDocument();
    const old = screen.getByText("以前のイベント").closest("a")!;
    expect(within(old).queryByRole("img")).toBeNull();
    expect(within(old).getByText(/作成日 /)).toBeInTheDocument();
  });

  it("イベントがないときは、案内を出す", async () => {
    fakeAdminBackend({ events: [] });
    render(<AdminEventsPage />);
    expect(await screen.findByText(/まだイベントがありません/)).toBeInTheDocument();
  });

  it("イベントを作るのは、別の画面。作ると、そのイベントのページへ移る(下書きで作られる)", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const { calls } = fakeAdminBackend({ events: [] });
    const user = userEvent.setup();
    render(<AdminEventNewPage />);
    const create = await screen.findByRole("button", { name: "作る" });
    expect(create).toBeDisabled();
    await user.type(screen.getByLabelText("イベント名"), "  新しいイベント ");
    await user.click(create);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/admin/events/e1"));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ name: "新しいイベント", description: "" });
  });

  it("一覧には、作るフォームを出さず、「イベントを作る」「管理者」のリンクを置く", async () => {
    fakeAdminBackend({ me: { role: "owner" } });
    render(<AdminEventsPage />);
    expect(await screen.findByRole("link", { name: "イベントを作る" })).toHaveAttribute("href", "/admin/events/new");
    expect(screen.getByRole("link", { name: "管理者" })).toHaveAttribute("href", "/admin/admins");
    expect(screen.queryByRole("form", { name: "イベントを作る" })).toBeNull();
    expect(screen.queryByLabelText("追加するGoogleアカウントのメールアドレス")).toBeNull();
  });

  it("管理者の追加と削除は、別の画面", async () => {
    fakeAdminBackend();
    render(<AdminAdminsPage />);
    expect(await screen.findByLabelText("追加するGoogleアカウントのメールアドレス")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /イベント一覧/ })).toHaveAttribute("href", "/admin");
  });

});

describe("イベントの画面", () => {
  beforeEach(() => saveAdminToken(TOKEN));

  it("テーマを一覧する", async () => {
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

  it("コピーのボタンで、招待URLをクリップボードに写す", async () => {
    fakeAdminBackend();
    const user = userEvent.setup();
    render(<AdminEventInvitePage eventId="e1" />);
    await screen.findByLabelText("招待URL");
    await user.click(screen.getByRole("button", { name: "コピー" }));
    expect(await screen.findByText("コピーしました。")).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/e/e1`);
  });

  it("クリップボードが使えない環境では、手でコピーする案内を出す", async () => {
    fakeAdminBackend();
    const user = userEvent.setup();
    render(<AdminEventInvitePage eventId="e1" />);
    await screen.findByLabelText("招待URL");
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    await user.click(screen.getByRole("button", { name: "コピー" }));
    expect(await screen.findByText(/長押ししてコピー/)).toBeInTheDocument();
  });

  it("テーマの一覧は、1つのリスト。1行に、ラジオ、テーマ名のリンク、状態が並ぶ(別々の一覧を出さない)", async () => {
    fakeAdminBackend({
      events: [event({ openSessionIds: ["s1"] })],
      sessions: [session(), session({ id: "s2", title: "場B", status: "closed" }), session({ id: "s3", title: "下書きのテーマ", status: "draft" })],
    });
    render(<AdminEventPage eventId="e1" />);
    const group = await screen.findByRole("group", { name: "投稿を受け付けるテーマ" });
    // テーマ名のリンクは、このリストの中に、1つずつだけある(別の一覧が、重ねて出ない)
    expect(screen.getAllByRole("link", { name: "ワークショップA" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "場B" })).toHaveLength(1);
    expect(within(group).getByRole("link", { name: "ワークショップA" })).toHaveAttribute("href", "/admin/events/e1/sessions/s1");
    // 1行に、ラジオと、リンクと、状態が並ぶ
    const row = within(group).getByRole("link", { name: "ワークショップA" }).closest(".list-group-item") as HTMLElement;
    expect(within(row).getByRole("radio", { name: "ワークショップA" })).toBeChecked();
    expect(within(row).getByText("公開中")).toBeInTheDocument();
    // 終了したテーマは、選べない。下書きは、ラジオなしで、状態が「下書き」
    expect(within(group).getByRole("radio", { name: "場B" })).toBeDisabled();
    const draftRow = within(group).getByRole("link", { name: "下書きのテーマ" }).closest(".list-group-item") as HTMLElement;
    expect(within(draftRow).queryByRole("radio")).toBeNull();
    expect(within(draftRow).getByText("下書き")).toBeInTheDocument();
    // 下書きがあるときだけ、公開の案内を出す
    expect(screen.getByText(/下書きは、参加者に見えません/)).toBeInTheDocument();
  });

  it("下書きが無いときは、下書きの案内を出さない。テーマが無いときは、その旨だけを出す", async () => {
    fakeAdminBackend();
    const { unmount } = render(<AdminEventPage eventId="e1" />);
    await screen.findByRole("group", { name: "投稿を受け付けるテーマ" });
    expect(screen.queryByText(/下書きは、参加者に見えません/)).toBeNull();
    unmount();
    fakeAdminBackend({ sessions: [] });
    render(<AdminEventPage eventId="e1" />);
    expect(await screen.findByText("まだテーマがありません。")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "投稿を受け付けるテーマ" })).toBeNull();
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

  it("イベントのページは、説明を固定で表示し、重い操作は、別の画面へのメニューにする", async () => {
    fakeAdminBackend({ events: [event({ description: "一行目\n二行目" })], me: { role: "owner" } });
    render(<AdminEventPage eventId="e1" />);
    const info = await screen.findByRole("region", { name: "イベントの情報" });
    expect(within(info).getByRole("heading", { name: "カンファレンス" })).toBeInTheDocument();
    expect(within(info).getByText(/一行目/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "テーマを追加" })).toHaveAttribute("href", "/admin/events/e1/sessions/new");
    const menu = await screen.findByRole("navigation", { name: "このイベントの操作" });
    expect(within(menu).getByRole("link", { name: /^編集/ })).toHaveAttribute("href", "/admin/events/e1/edit");
    expect(within(menu).getByRole("link", { name: /^招待URLとQR/ })).toHaveAttribute("href", "/admin/events/e1/invite");
    expect(within(menu).getByRole("link", { name: /^議題の提案/ })).toHaveAttribute("href", "/admin/events/e1/proposals");
    expect(within(menu).getByRole("link", { name: /^全テーマの記録/ })).toHaveAttribute("href", "/admin/events/e1/notes");
    expect(within(menu).getByRole("link", { name: /^AIの利用状況/ })).toHaveAttribute("href", "/admin/events/e1/usage");
    expect(within(menu).queryByRole("link", { name: /運営者のリンク/ })).toBeNull();
    expect(within(menu).getByRole("link", { name: /^参加者の画面を見る/ })).toHaveAttribute("href", "/e/e1");
    // 重い操作の中身は、このページに出さない
    expect(screen.queryByLabelText("イベント名")).toBeNull();
    expect(screen.queryByRole("img", { name: "招待URLのQRコード" })).toBeNull();
    expect(screen.queryByLabelText("議題の提案を受け付ける")).toBeNull();
    expect(screen.queryByText("AIの利用状況（今日）")).toBeNull();
  });

  it("イベントの下位の画面は、イベントのページへ戻れる", async () => {
    fakeAdminBackend();
    for (const Page of [AdminNotesPage, AdminUsagePage]) {
      const { unmount } = render(<Page eventId="e1" />);
      expect(await screen.findByRole("link", { name: /イベント$/ })).toHaveAttribute("href", "/admin/events/e1");
      unmount();
    }
  });

  it("説明が無いときは、その旨を出す。公開前のイベントには、状態の案内を出す", async () => {
    fakeAdminBackend({ events: [event({ description: "", status: "draft" })] });
    render(<AdminEventPage eventId="e1" />);
    expect(await screen.findByText("説明はありません。")).toBeInTheDocument();
    expect(screen.getByText(/編集の画面で、状態を切り替えます/)).toBeInTheDocument();
  });

  it("議題の提案を受け付ける設定を切り替える(議題の提案の画面)", async () => {
    const { calls } = fakeAdminBackend();
    const user = userEvent.setup();
    render(<AdminProposalsPage eventId="e1" />);
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
    render(<AdminProposalsPage eventId="e1" />);
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
    const form = await screen.findByRole("form", { name: "テーマを作る" });
    const submit = within(form).getByRole("button", { name: "作る" });
    await user.type(within(form).getByLabelText("テーマ名"), "新テーマ");
    expect(submit).toBeDisabled();
    await user.type(within(form).getByLabelText("参加者への問い"), "どう思いますか");
    await user.selectOptions(within(form).getByLabelText("形式"), "ost");
    await user.click(within(form).getByLabelText("投稿された意見を、参加者にも見せる"));
    await user.click(submit);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/admin/events/e1/sessions/s1"));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      title: "新テーマ",
      prompt: "どう思いますか",
      format: "ost",
      showOpinionsToParticipants: false,
    });
  });});

describe("テーマの画面", () => {
  beforeEach(() => saveAdminToken(TOKEN));

  it("テーマのページには、URLのコピーもQRも、設定のフォームも出さない", async () => {
    fakeAdminBackend();
    render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    await screen.findByRole("navigation", { name: "このテーマの操作" });
    expect(screen.queryByLabelText("参加者のURL")).toBeNull();
    expect(screen.queryByRole("img", { name: /QRコード/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "コピー" })).toBeNull();
    expect(screen.queryByRole("form", { name: "テーマの設定" })).toBeNull();
    expect(screen.queryByLabelText("結論")).toBeNull();
  });

  it("ボードが基本。参加者の画面を開くリンクと、設定・記録への入口と、意見を管理するリンクを置く", async () => {
    fakeAdminBackend({
      opinions: [opinion("o1", "一つ目の意見", "idea"), opinion("o2", "二つ目の意見", "question")],
    });
    const user = userEvent.setup();
    render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    const opinions = await screen.findByRole("region", { name: "投稿された意見" });
    expect(screen.getByRole("link", { name: "参加者の画面を見る" })).toHaveAttribute("href", "/e/e1");
    const menu = screen.getByRole("navigation", { name: "このテーマの操作" });
    expect(within(menu).getByRole("link", { name: /^テーマの設定/ })).toHaveAttribute("href", "/admin/events/e1/sessions/s1/edit");
    expect(within(menu).getByRole("link", { name: /^議論の記録/ })).toHaveAttribute("href", "/admin/events/e1/sessions/s1/notes");

    // 基本は、ボード(付箋)。非表示や削除は、ボードでは出さない
    expect(within(opinions).getAllByTestId("sticky-note").length).toBeGreaterThan(0);
    expect(within(opinions).getByText("一つ目の意見")).toBeInTheDocument();
    expect(within(opinions).queryByRole("button", { name: "非表示にする" })).toBeNull();
    // 「意見を管理する」のリンクから、管理者向けの更新画面(一覧と、非表示・削除)が出る
    await user.click(within(opinions).getByRole("link", { name: "意見を管理する" }));
    expect(await within(opinions).findAllByRole("button", { name: "非表示にする" })).toHaveLength(2);
    expect(within(opinions).queryByTestId("sticky-note")).toBeNull();
    // 管理画面では、分析やメニューを出さない。ボードへ戻れる
    expect(screen.queryByRole("navigation", { name: "このテーマの操作" })).toBeNull();
    await user.click(within(opinions).getByRole("button", { name: "ボードへ戻る" }));
    expect((await within(opinions).findAllByTestId("sticky-note")).length).toBeGreaterThan(0);
    expect(screen.getByRole("navigation", { name: "このテーマの操作" })).toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  it("テーマが下書きのときは、状態を示し、設定への入口を警告に添える", async () => {
    fakeAdminBackend({ sessions: [session({ status: "draft" })] });
    render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    await screen.findByRole("navigation", { name: "このテーマの操作" });
    expect(screen.getAllByText("下書き").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "テーマの設定を開く" })).toHaveAttribute("href", "/admin/events/e1/sessions/s1/edit");
  });

  it("公開中でないときは、参加者に見えない旨を警告する", async () => {
    fakeAdminBackend({ sessions: [session({ status: "draft" })] });
    render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    expect(await screen.findByText(/両方とも「公開中」のときだけ/)).toBeInTheDocument();
  });

  it("イベントもテーマも公開中なら、警告を出さない", async () => {
    fakeAdminBackend();
    render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    await screen.findByRole("navigation", { name: "このテーマの操作" });
    expect(screen.queryByText(/両方とも「公開中」のときだけ/)).toBeNull();
  });

  it("投稿の件数をボードに出し、意見の管理の画面では、カードを新しい順に出す", async () => {
    fakeAdminBackend({
      opinions: [opinion("o1", "古い意見", "idea", "2026-01-01T00:00:00.000Z"), opinion("o2", "新しい意見", "question", "2026-01-01T00:05:00.000Z")],
    });
    const user = userEvent.setup();
    render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    expect(await screen.findByText("投稿された意見（2件）")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "意見を管理する" }));
    expect(await screen.findByText("意見の管理（2件）")).toBeInTheDocument();
    const cards = screen.getAllByTestId("opinion-card");
    expect(cards[0]).toHaveTextContent("新しい意見");
    expect(cards[1]).toHaveTextContent("古い意見");
  });

  it("設定の画面で、状態を「終了」にすると、すぐに保存する", async () => {
    const { calls } = fakeAdminBackend();
    const user = userEvent.setup();
    render(<AdminSessionEditPage eventId="e1" sessionId="s1" />);
    await user.selectOptions(await screen.findByLabelText("状態"), "closed");
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH" && c.body?.status === "closed")).toBe(true));
  });

  it("設定の画面で、意見を見せる設定を、切り替えて保存できる。テーマのページへ戻れる", async () => {
    const { calls } = fakeAdminBackend();
    const user = userEvent.setup();
    render(<AdminSessionEditPage eventId="e1" sessionId="s1" />);
    await user.click(await screen.findByLabelText("投稿された意見を、参加者にも見せる"));
    await user.click(screen.getByRole("button", { name: "保存する" }));
    await screen.findByText("保存しました。");
    expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ showOpinionsToParticipants: false });
    expect(screen.getByRole("link", { name: /テーマ$/ })).toHaveAttribute("href", "/admin/events/e1/sessions/s1");
  });

  it("議論の記録の画面で、結論を保存できる。存在しないテーマでは、見つからない旨を出す", async () => {
    fakeAdminBackend();
    const { unmount } = render(<AdminSessionNotesPage eventId="e1" sessionId="s1" />);
    expect(await screen.findByLabelText("結論")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /テーマ$/ })).toHaveAttribute("href", "/admin/events/e1/sessions/s1");
    unmount();
    render(<AdminSessionNotesPage eventId="e1" sessionId="nope" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("テーマが見つかりません");
  });

  it("存在しないテーマでは、見つからない旨を出す", async () => {
    fakeAdminBackend();
    render(<AdminSessionPage eventId="e1" sessionId="nope" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("テーマが見つかりません");
  });

  it("不適切な投稿を、意見の管理の画面で、非表示にして、表示に戻せる", async () => {
    const { calls } = fakeAdminBackend({ opinions: [opinion("o1", "問題のある意見")] });
    const user = userEvent.setup();
    render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    await user.click(await screen.findByRole("link", { name: "意見を管理する" }));
    await user.click(await screen.findByRole("button", { name: "非表示にする" }));
    expect(await screen.findByText("非表示中")).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/opinions/o1/moderation")?.body).toEqual({ status: "hidden" });
    await user.click(screen.getByRole("button", { name: "表示に戻す" }));
    await waitFor(() => expect(screen.queryByText("非表示中")).toBeNull());
    expect(calls.filter((c) => c.path === "/opinions/o1/moderation").at(-1)?.body).toEqual({ status: "active" });
  });

  it("削除は、意見の管理の画面で、確認のあとにだけ実行する", async () => {
    const { calls } = fakeAdminBackend({ opinions: [opinion("o1", "消したい意見")] });
    const user = userEvent.setup();
    render(<AdminSessionPage eventId="e1" sessionId="s1" />);
    await user.click(await screen.findByRole("link", { name: "意見を管理する" }));
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
