import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminApi } from "../src/api/admin.ts";
import type { NotesEntry } from "../src/api/types.ts";
import { NotesEditor } from "../src/components/admin/NotesEditor.tsx";
import { NotesOverview } from "../src/components/admin/NotesOverview.tsx";
import { PublishedNotes } from "../src/components/PublishedNotes.tsx";
import { notesToMarkdown } from "../src/lib/notesMarkdown.ts";
import { json, stubFetch } from "./helpers.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

const at = "2026-01-01T00:00:00.000Z";
const entry = (over: Partial<NotesEntry> = {}): NotesEntry => ({
  sessionId: "s1",
  title: "場A",
  published: true,
  notes: {
    conclusion: "朝会を15分にそろえる",
    nextActions: [{ text: "カレンダーを更新する", owner: "進行役" }],
    openQuestions: ["遅刻者への共有は？"],
    updatedAt: at,
  },
  ...over,
});

describe("notesToMarkdown", () => {
  it("テーマごとに、結論・次の行動・未解決の問いを出す", () => {
    const md = notesToMarkdown("OST", [entry()]);
    expect(md).toContain("# OST");
    expect(md).toContain("## 場A");
    expect(md).toContain("朝会を15分にそろえる");
    expect(md).toContain("- カレンダーを更新する（担当: 進行役）");
    expect(md).toContain("- 遅刻者への共有は？");
  });

  it("空の項目は「未記入」「なし」にし、見出しの改行で崩れない", () => {
    const md = notesToMarkdown("OST\n# 偽の見出し", [
      entry({ title: "場B\n## 偽", notes: { conclusion: "", nextActions: [], openQuestions: [], updatedAt: at } }),
    ]);
    expect(md).toContain("# OST # 偽の見出し");
    expect(md).toContain("## 場B ## 偽");
    expect(md).toContain("（未記入）");
    expect(md.match(/（なし）/g)).toHaveLength(2);
  });
});

describe("NotesEditor", () => {
  it("書いた内容を、空の行を除いて保存する。公開にチェックしなければ、未公開", async () => {
    const saveNotes = vi.fn(async () => ({ notes: entry().notes, published: false }));
    const api = { saveNotes } as unknown as AdminApi;
    const user = userEvent.setup();
    render(<NotesEditor api={api} sessionId="s1" initial={undefined} initialPublished={false} describeError={String} />);
    await user.type(screen.getByLabelText("結論"), "結論です");
    await user.click(screen.getByRole("button", { name: "次の行動を足す" }));
    await user.type(screen.getByLabelText("次の行動 1"), "資料を作る");
    await user.type(screen.getByLabelText("担当 1"), "担当A");
    await user.click(screen.getByRole("button", { name: "次の行動を足す" }));
    await user.type(screen.getByLabelText(/未解決の問い/), "いつやる？\n\n誰がやる？");
    await user.click(screen.getByRole("button", { name: "記録を保存する" }));
    expect(saveNotes).toHaveBeenCalledWith("s1", {
      conclusion: "結論です",
      nextActions: [{ text: "資料を作る", owner: "担当A" }],
      openQuestions: ["いつやる？", "誰がやる？"],
      published: false,
    });
    expect(await screen.findByText("保存しました。参加者には見えません。")).toBeInTheDocument();
  });

  it("公開にチェックして保存すると、公開した旨を出す", async () => {
    const saveNotes = vi.fn(async () => ({ notes: entry().notes, published: true }));
    const api = { saveNotes } as unknown as AdminApi;
    const user = userEvent.setup();
    render(<NotesEditor api={api} sessionId="s1" initial={entry().notes} initialPublished={false} describeError={String} />);
    expect(screen.getByLabelText("結論")).toHaveValue("朝会を15分にそろえる");
    await user.click(screen.getByLabelText("参加者に公開する"));
    await user.click(screen.getByRole("button", { name: "記録を保存する" }));
    expect(await screen.findByText("保存して、公開しました。")).toBeInTheDocument();
  });

  it("保存に失敗したら、エラーを出す", async () => {
    const api = {
      saveNotes: vi.fn(async () => {
        throw new Error("失敗");
      }),
    } as unknown as AdminApi;
    render(<NotesEditor api={api} sessionId="s1" initial={undefined} initialPublished={false} describeError={(e) => (e as Error).message} />);
    await userEvent.click(screen.getByRole("button", { name: "記録を保存する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("失敗");
  });
});

describe("NotesEditor: 要約からの下書き", () => {
  const source = { overview: "アクセスの話が中心でした", clusterTitles: ["アクセス", "予約"], questions: ["どう改善する？", "遅刻者への共有は？"] };

  it("取り込みボタンは、要約があるときだけ出す", () => {
    const api = { saveNotes: vi.fn() } as unknown as AdminApi;
    const { rerender } = render(<NotesEditor api={api} sessionId="s1" initial={undefined} initialPublished={false} describeError={String} draftSource={null} />);
    expect(screen.queryByRole("button", { name: "要約から下書きを取り込む" })).toBeNull();
    rerender(<NotesEditor api={api} sessionId="s1" initial={undefined} initialPublished={false} describeError={String} draftSource={source} />);
    expect(screen.getByRole("button", { name: "要約から下書きを取り込む" })).toBeInTheDocument();
  });

  it("取り込んでも、保存も公開もしない。AIの下書きと分かる注意を出し、既にある内容は消さない", async () => {
    const saveNotes = vi.fn(async () => ({ notes: entry().notes, published: false }));
    const api = { saveNotes } as unknown as AdminApi;
    const user = userEvent.setup();
    render(<NotesEditor api={api} sessionId="s1" initial={{ ...entry().notes, openQuestions: ["遅刻者への共有は？"] }} initialPublished={false} describeError={String} draftSource={source} />);
    await user.click(screen.getByRole("button", { name: "要約から下書きを取り込む" }));
    expect(saveNotes).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("AIによる下書きを取り込みました");
    const conclusion = screen.getByLabelText("結論") as HTMLTextAreaElement;
    expect(conclusion.value).toContain("朝会を15分にそろえる");
    expect(conclusion.value).toContain("アクセスの話が中心でした");
    expect(conclusion.value).toContain("主なまとまり: アクセス、予約");
    // 問いは重複せず、後ろに足される
    expect((screen.getByLabelText(/未解決の問い/) as HTMLTextAreaElement).value).toBe("遅刻者への共有は？\nどう改善する？");
    expect(screen.getByLabelText("参加者に公開する")).not.toBeChecked();
  });

  it("確認して保存すると、注意は消える。取り込んだだけでは、公開の状態は変わらない", async () => {
    const saveNotes = vi.fn(async () => ({ notes: entry().notes, published: false }));
    const api = { saveNotes } as unknown as AdminApi;
    const user = userEvent.setup();
    render(<NotesEditor api={api} sessionId="s1" initial={undefined} initialPublished={false} describeError={String} draftSource={source} />);
    await user.click(screen.getByRole("button", { name: "要約から下書きを取り込む" }));
    await user.click(screen.getByRole("button", { name: "記録を保存する" }));
    expect(saveNotes).toHaveBeenCalledWith("s1", expect.objectContaining({ published: false }));
    await screen.findByText("保存しました。参加者には見えません。");
    expect(screen.queryByText(/AIによる下書きを取り込みました/)).toBeNull();
  });
});

describe("NotesOverview と PublishedNotes", () => {
  it("運営者は全テーマの記録を、公開の状態つきで見て、Markdown にできる", async () => {
    const api = { listNotes: vi.fn(async () => [entry(), entry({ sessionId: "s2", title: "場B", published: false })]) } as unknown as AdminApi;
    const user = userEvent.setup();
    render(<NotesOverview api={api} eventId="e1" eventName="OST" describeError={String} />);
    expect(await screen.findByText("公開中")).toBeInTheDocument();
    expect(screen.getByText("未公開")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Markdownにして、コピーする" }));
    const field = (await screen.findByLabelText(/Markdown/)) as HTMLTextAreaElement;
    expect(field.value).toContain("## 場B");
  });

  it("記録が無いときは、何も出さない", async () => {
    const api = { listNotes: vi.fn(async () => []) } as unknown as AdminApi;
    const { container } = render(<NotesOverview api={api} eventId="e1" eventName="OST" describeError={String} />);
    await vi.waitFor(() => expect(api.listNotes).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("参加者には、公開された記録を見せる。無ければ何も出さない", async () => {
    stubFetch(() => json({ notes: [entry()] }));
    render(<PublishedNotes eventId="e1" />);
    expect(await screen.findByRole("region", { name: "議論の記録" })).toBeInTheDocument();
    expect(screen.getByText("朝会を15分にそろえる")).toBeInTheDocument();
    vi.unstubAllGlobals();
    stubFetch(() => json({ notes: [] }));
    const { container } = render(<PublishedNotes eventId="e2" />);
    await vi.waitFor(() => expect(container.querySelector("section")).toBeNull());
  });
});
