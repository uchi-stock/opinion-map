import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRecord, OpinionRecord } from "../../backend/src/domain/types.ts";
import { DemoBanner } from "../src/demo/DemoBanner.tsx";
import { DEMO_ADMIN_TOKEN, installDemoApi } from "../src/demo/installDemoApi.ts";
import { createStorageRepositories, DEMO_DATA_KEY, resetDemoData } from "../src/demo/storageRepositories.ts";
import { AdminEventsPage } from "../src/pages/admin/AdminEventsPage.tsx";
import { ParticipantPage } from "../src/pages/ParticipantPage.tsx";
import { saveAdminToken } from "../src/lib/adminToken.ts";

/** localStorage の代わり。別のタブと共有する場面を、同じ Map を使って再現する */
function fakeStorage(initial?: Map<string, string>) {
  const map = initial ?? new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
  return { map, storage: storage as unknown as Storage };
}

const at = "2026-01-01T00:00:00.000Z";
const eventRecord = (id: string): EventRecord => ({
  id,
  name: id,
  description: "",
  status: "active",
  createdAt: at,
  updatedAt: at,
});
const opinionRecord = (over: Partial<OpinionRecord>): OpinionRecord => ({
  id: "o1",
  sessionId: "s1",
  submissionId: "sub-00000001-aaaaaaaa",
  body: "本文",
  kind: "idea",
  status: "active",
  createdAt: at,
  updatedAt: at,
  ...over,
});

describe("デモ版のデータ置き場", () => {
  it("保存した内容を、別のインスタンス（別のタブ）から読める", async () => {
    const { storage } = fakeStorage();
    await createStorageRepositories(storage).events.create(eventRecord("e1"));
    expect((await createStorageRepositories(storage).events.get("e1"))?.name).toBe("e1");
  });

  it("同じ送信IDの投稿は、重複して作らない", async () => {
    const { storage } = fakeStorage();
    const repos = createStorageRepositories(storage);
    const first = await repos.opinions.createIfAbsent(opinionRecord({ id: "o1" }));
    const second = await repos.opinions.createIfAbsent(opinionRecord({ id: "o2" }));
    expect(first.created).toBe(true);
    expect(second).toMatchObject({ created: false, opinion: { id: "o1" } });
    expect(await repos.opinions.listBySession("s1")).toHaveLength(1);
  });

  it("壊れた保存内容でも、例外を投げず、空として扱う", async () => {
    const { storage, map } = fakeStorage();
    map.set(DEMO_DATA_KEY, "{not json");
    expect(await createStorageRepositories(storage).events.list()).toEqual([]);
  });

  it("保存できない環境でも、そのページの間は動く", async () => {
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
    } as unknown as Storage;
    const repos = createStorageRepositories(broken);
    await repos.events.create(eventRecord("e1"));
    expect((await repos.events.list()).map((e) => e.id)).toEqual(["e1"]);
    expect(() => resetDemoData(broken)).not.toThrow();
  });

  it("リセットすると、データが消える", async () => {
    const { storage } = fakeStorage();
    const repos = createStorageRepositories(storage);
    await repos.events.create(eventRecord("e1"));
    resetDemoData(storage);
    expect(await repos.events.list()).toEqual([]);
  });
});

describe("デモ版のAPI（ブラウザの中のバックエンド）", () => {
  function setup(map?: Map<string, string>) {
    const { storage, map: m } = fakeStorage(map);
    const original = vi.fn(async () => new Response("original"));
    const target = { fetch: original as unknown as typeof fetch };
    return { storage, map: m, original, target, install: () => installDemoApi({ storage, target, apiBase: "/api" }) };
  }

  it("はじめに、公開済みのイベント・セッションと、サンプルの意見を作る", async () => {
    const { install, target } = setup();
    const { sampleSessionId } = await install();
    expect(sampleSessionId).toBeTruthy();
    const session = await (await target.fetch(`/api/sessions/${sampleSessionId}`)).json();
    expect(session).toMatchObject({ acceptingOpinions: true, title: "デモ用セッション" });
    const list = await (await target.fetch(`/api/sessions/${sampleSessionId}/opinions`)).json();
    expect(list.opinions).toHaveLength(3);
  });

  it("データがあれば、作り直さない", async () => {
    const first = setup();
    const a = await first.install();
    const second = setup(first.map);
    const b = await second.install();
    expect(b.sampleSessionId).toBe(a.sampleSessionId);
    const events = await (
      await second.target.fetch("/api/events", { headers: { authorization: `Bearer ${DEMO_ADMIN_TOKEN}` } })
    ).json();
    expect(events.events).toHaveLength(1);
  });

  it("運営者のAPIは、トークンがないと401", async () => {
    const { install, target } = setup();
    await install();
    expect((await target.fetch("/api/events")).status).toBe(401);
    expect((await target.fetch("/api/events", { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
  });

  it("API以外のURLは、元の fetch に任せる", async () => {
    const { install, target, original } = setup();
    await install();
    // 差し替え後の fetch で、API以外を呼ぶ
    await target.fetch("https://example.test/other");
    expect(original).toHaveBeenCalledTimes(1);
  });

  it("別のタブでの投稿が、こちらでも見える（localStorage を共有する）", async () => {
    const tab1 = setup();
    const { sampleSessionId } = await tab1.install();
    const tab2 = setup(tab1.map);
    await tab2.install();
    await tab2.target.fetch(`/api/sessions/${sampleSessionId}/opinions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "別のタブからの投稿", kind: "idea", submissionId: "tab2-submission-0001" }),
    });
    const list = await (await tab1.target.fetch(`/api/sessions/${sampleSessionId}/opinions`)).json();
    expect(list.opinions.map((o: { body: string }) => o.body)).toContain("別のタブからの投稿");
  });
});

describe("デモ版の画面（本物の画面とバックエンドのコードを、ブラウザの中でつなぐ）", () => {
  let realFetch: typeof fetch;
  beforeEach(() => {
    realFetch = globalThis.fetch;
    window.localStorage.clear();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("運営者の画面でイベントを作ると、一覧に出る", async () => {
    await installDemoApi({ storage: window.localStorage, apiBase: "/api" });
    saveAdminToken(DEMO_ADMIN_TOKEN);
    const user = userEvent.setup();
    render(<AdminEventsPage />);
    expect(await screen.findByText("デモ用イベント")).toBeInTheDocument();
    await user.type(screen.getByLabelText("イベント名"), "スマホで作る");
    await user.click(screen.getByRole("button", { name: "作る" }));
    expect(await screen.findByText("スマホで作る")).toBeInTheDocument();
  });

  it("参加者の画面で投稿すると、一覧に出る", async () => {
    const { sampleSessionId } = await installDemoApi({ storage: window.localStorage, apiBase: "/api" });
    const user = userEvent.setup();
    render(<ParticipantPage sessionId={sampleSessionId!} />);
    await user.type(await screen.findByRole("textbox", { name: "あなたの意見" }), "デモからの投稿");
    await user.click(screen.getByRole("button", { name: "投稿する" }));
    expect(await screen.findByText("デモからの投稿")).toBeInTheDocument();
  });
});

describe("デモ版のお知らせ", () => {
  it("デモ版であること、データが共有されないこと、トークンを表示する", () => {
    render(<DemoBanner sampleSessionId="s1" onReset={() => {}} />);
    expect(screen.getByText("デモ版です。")).toBeInTheDocument();
    expect(screen.getByText(/他の人とは共有されません/)).toBeInTheDocument();
    expect(screen.getByText(/トークンは「demo」/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "運営者の画面" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: "参加者の画面（サンプル）" })).toHaveAttribute("href", "/s/s1");
  });

  it("サンプルのセッションがないときは、そのリンクを出さない", () => {
    render(<DemoBanner sampleSessionId={undefined} onReset={() => {}} />);
    expect(screen.queryByRole("link", { name: "参加者の画面（サンプル）" })).toBeNull();
  });

  it("「最初からやり直す」で、リセットを呼ぶ", async () => {
    const onReset = vi.fn();
    render(<DemoBanner sampleSessionId="s1" onReset={onReset} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "最初からやり直す" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
