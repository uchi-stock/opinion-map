import type { NotesEntry, PublicSummaryResponse, Proposal, ProposalList, PublicEvent, OpinionKind, OpinionList, OpinionResult, OpinionSubmission, PublicOpinion, PublicSession } from "./types.ts";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function apiBaseUrl(): string {
  const configured = import.meta.env["VITE_API_BASE_URL"] as string | undefined;
  return (configured ?? "/api").replace(/\/+$/, "");
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, init);
  } catch {
    throw new ApiError(0, "network_error", "通信に失敗しました。電波の良い場所で、もう一度お試しください。");
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = undefined;
  }
  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string } } | undefined)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "unknown_error",
      error?.message ?? "エラーが発生しました。時間をおいて、もう一度お試しください。",
    );
  }
  return data as T;
}

const enc = encodeURIComponent;

export function getPublicEvent(eventId: string): Promise<PublicEvent> {
  return request<PublicEvent>(`/events/${enc(eventId)}/public`);
}

export async function listNotes(eventId: string): Promise<NotesEntry[]> {
  return (await request<{ notes: NotesEntry[] }>(`/events/${enc(eventId)}/notes`)).notes;
}

export function getPublicSummary(sessionId: string): Promise<PublicSummaryResponse> {
  return request<PublicSummaryResponse>(`/sessions/${enc(sessionId)}/summary`);
}

export function listProposals(eventId: string): Promise<ProposalList> {
  return request<ProposalList>(`/events/${enc(eventId)}/proposals`);
}

export function postProposal(
  eventId: string,
  input: { submissionId: string; title: string; description: string },
): Promise<{ proposal: Proposal; duplicate: boolean }> {
  return request(`/events/${enc(eventId)}/proposals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function reactToProposal(proposalId: string, voterId: string, reacted: boolean): Promise<{ reacted: boolean; count: number }> {
  return request(`/proposals/${enc(proposalId)}/reaction`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ voterId, reacted }),
  });
}

export function getSession(sessionId: string): Promise<PublicSession> {
  return request<PublicSession>(`/sessions/${enc(sessionId)}`);
}

export function listOpinions(sessionId: string): Promise<OpinionList> {
  return request<OpinionList>(`/sessions/${enc(sessionId)}/opinions`);
}

export function postOpinion(sessionId: string, submission: OpinionSubmission): Promise<OpinionResult> {
  return request<OpinionResult>(`/sessions/${enc(sessionId)}/opinions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(submission),
  });
}

const jsonPost = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** 自分の投稿を編集する。投稿時に作った鍵が必要 */
export function editOpinion(
  opinionId: string,
  input: { editKey: string; body: string; kind?: OpinionKind },
): Promise<{ opinion: PublicOpinion }> {
  return request(`/opinions/${enc(opinionId)}`, jsonPost("PATCH", input));
}

/** 自分の投稿を削除する。削除すると、本文は消え、戻せない */
export function reactToOpinion(opinionId: string, voterId: string, reacted: boolean): Promise<{ reacted: boolean; count: number }> {
  return request(`/opinions/${enc(opinionId)}/reaction`, jsonPost("POST", { voterId, reacted }));
}

export function deleteOpinion(opinionId: string, editKey: string): Promise<{ deleted: true }> {
  return request(`/opinions/${enc(opinionId)}/delete`, jsonPost("POST", { editKey }));
}

/**
 * 画面のエラーを、サーバーのログに知らせる。失敗しても何もしない(エラーの報告で、さらにエラーを出さない)。
 * 送るのは、エラーの種類と短いメッセージと、パスだけ。クエリとハッシュ(トークンが入りうる)は送らない。
 */
export function reportClientError(error: unknown): void {
  try {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    void fetch(`${apiBaseUrl()}/client-errors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: message.slice(0, 200), path: window.location.pathname }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 報告できなくても、画面の動作には影響させない
  }
}
