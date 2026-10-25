import type { OpinionList, OpinionResult, OpinionSubmission, PublicSession } from "./types.ts";

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

function baseUrl(): string {
  const configured = import.meta.env["VITE_API_BASE_URL"] as string | undefined;
  return (configured ?? "/api").replace(/\/+$/, "");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, init);
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
