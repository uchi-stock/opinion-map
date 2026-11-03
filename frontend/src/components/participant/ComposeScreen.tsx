import type { OpinionResult, PublicSession } from "../../api/types.ts";
import { OpinionForm } from "../OpinionForm.tsx";

/** 投稿画面(#post)。投稿について、の説明と、投稿フォーム */
export function ComposeScreen({
  session,
  sessionId,
  onBack,
  onSubmitted,
}: {
  session: PublicSession;
  sessionId: string;
  onBack: () => void;
  onSubmitted: (result: OpinionResult) => void;
}) {
  return (
    <>
      <div className="mb-3">
        <button
          type="button"
          className="btn icon-btn btn-sm btn-outline-secondary"
          onClick={onBack}
          aria-label="ボードへ戻る"
          title="ボードへ戻る"
        >
          ⬅️
        </button>
      </div>
      <section className="mb-4" aria-label="投稿について">
        <div className="card bg-body-tertiary">
          <div className="card-body small">
            <p className="mb-1">
              <strong>投稿について</strong>
            </p>
            <ul className="mb-0 ps-3">
              <li>名前の入力は不要です。投稿は匿名で扱われます。</li>
              <li>
                {session.showOpinions
                  ? "投稿は、このページを開いている参加者と運営者に表示されます。"
                  : "投稿は、運営者にだけ表示されます。"}
              </li>
              <li>
                運営者が、AIを使って意見を分析することがあります。そのために、外部のAIサービスへ送信される場合があります。
                AIの結果は参考情報であり、運営者が確認します。
              </li>
              <li>自分の投稿は、投稿したこのブラウザから、編集・削除できます。</li>
              <li>個人が特定される情報は書かないでください。</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mb-4" aria-label="投稿する">
        {session.acceptingOpinions ? (
          <OpinionForm sessionId={sessionId} onSubmitted={onSubmitted} />
        ) : (
          <div className="alert alert-secondary mb-0" role="status">
            現在、投稿を受け付けていません。
          </div>
        )}
      </section>

    </>
  );
}
