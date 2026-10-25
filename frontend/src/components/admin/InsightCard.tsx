import { useState, type FormEvent } from "react";
import type { AdminApi } from "../../api/admin.ts";
import type { Insight, InsightContent } from "../../api/types.ts";

const SECTIONS: ReadonlyArray<{ key: keyof InsightContent; title: string }> = [
  { key: "commonPoints", title: "共通点（一致しているとは限りません）" },
  { key: "differences", title: "相違点" },
  { key: "premiseDifferences", title: "前提の違い" },
  { key: "questions", title: "議論の問いの案" },
];

const toLines = (items: string[]) => items.join("\n");
const fromLines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");

/**
 * クラスタごとの、共通点・相違点・問いの案。
 * AIの案であることを示し、ファシリテーターが編集・採用する。
 * 編集してもAIの出力は変わらず、元の案との差を残す。
 */
export function InsightCard({
  api,
  insight,
  describeError,
  onChanged,
}: {
  api: AdminApi;
  insight: Insight;
  describeError: (e: unknown) => string;
  onChanged: (updated: Insight) => void;
}) {
  const content = insight.edited ?? insight.ai;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<keyof InsightContent, string>>(() => ({
    commonPoints: toLines(content.commonPoints),
    differences: toLines(content.differences),
    premiseDifferences: toLines(content.premiseDifferences),
    questions: toLines(content.questions),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(patch: Parameters<AdminApi["updateInsight"]>[1]) {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      onChanged(await api.updateInsight(insight.id, patch));
      return true;
    } catch (e) {
      setError(describeError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const edited: InsightContent = {
      commonPoints: fromLines(draft.commonPoints),
      differences: fromLines(draft.differences),
      premiseDifferences: fromLines(draft.premiseDifferences),
      questions: fromLines(draft.questions),
    };
    if (await run({ edited })) setEditing(false);
  }

  return (
    <div className="border rounded p-2 mt-2" role="group" aria-label="AIによる提案">
      <div className="d-flex gap-2 mb-2">
        <span className="badge text-bg-info">AIによる提案</span>
        {insight.edited && <span className="badge text-bg-secondary">編集済み</span>}
        {insight.approved && <span className="badge text-bg-success">採用</span>}
      </div>
      {editing ? (
        <form onSubmit={save} aria-label="案の編集">
          {SECTIONS.map(({ key, title }) => (
            <div key={key} className="mb-2">
              <label htmlFor={`${insight.id}-${key}`} className="form-label small mb-1">
                {title}（1行に1項目）
              </label>
              <textarea
                id={`${insight.id}-${key}`}
                className="form-control"
                rows={3}
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </div>
          ))}
          <button type="submit" className="btn btn-sm btn-primary me-2" disabled={busy}>
            保存する
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(false)}>
            やめる
          </button>
        </form>
      ) : (
        <>
          {SECTIONS.map(({ key, title }) =>
            content[key].length === 0 ? null : (
              <div key={key} className="mb-2">
                <h5 className="h6 small mb-1">{title}</h5>
                <ul className="mb-0 ps-3">
                  {content[key].map((item, i) => (
                    <li key={i} style={{ overflowWrap: "anywhere" }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
          <div className="d-flex gap-2 align-items-center flex-wrap">
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setEditing(true)}>
              編集する
            </button>
            <div className="form-check mb-0">
              <input
                id={`${insight.id}-approved`}
                type="checkbox"
                className="form-check-input"
                checked={insight.approved}
                disabled={busy}
                onChange={(e) => void run({ approved: e.target.checked })}
              />
              <label htmlFor={`${insight.id}-approved`} className="form-check-label">
                議論に使う
              </label>
            </div>
          </div>
        </>
      )}
      {error && (
        <div className="alert alert-danger mt-2 mb-0" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
