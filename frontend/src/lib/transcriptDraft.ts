const key = (sessionId: string) => `opinion-map:transcript:${sessionId}`;

/** 話した内容の文字の下書きを、この端末にだけ残す。再読み込みや電波切れで、失わないため */
export function loadTranscriptDraft(sessionId: string): string {
  try {
    return window.localStorage.getItem(key(sessionId)) ?? "";
  } catch {
    return "";
  }
}

export function saveTranscriptDraft(sessionId: string, text: string): void {
  try {
    if (text === "") window.localStorage.removeItem(key(sessionId));
    else window.localStorage.setItem(key(sessionId), text);
  } catch {
    // 保存できなくても、画面の動作には影響させない
  }
}
