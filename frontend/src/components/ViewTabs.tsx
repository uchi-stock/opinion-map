/** 「そのまま」と「要約」の切り替え。どちらを見ているかを、はっきり示す */
export type ContentView = "raw" | "summary";

export function ViewTabs({ view, onChange, summaryAvailable }: { view: ContentView; onChange: (v: ContentView) => void; summaryAvailable: boolean }) {
  if (!summaryAvailable) return null;
  return (
    <div className="btn-group w-100 mb-3" role="group" aria-label="見方の切り替え">
      <button type="button" className={`btn icon-btn ${view === "raw" ? "btn-dark" : "btn-outline-dark"}`} aria-pressed={view === "raw"} onClick={() => onChange("raw")} aria-label="そのまま（原文）" title="そのまま（原文）">📄</button>
      <button type="button" className={`btn icon-btn ${view === "summary" ? "btn-dark" : "btn-outline-dark"}`} aria-pressed={view === "summary"} onClick={() => onChange("summary")} aria-label="要約（AI）" title="要約（AI）">✨</button>
    </div>
  );
}
