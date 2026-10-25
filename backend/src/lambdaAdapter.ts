import type { HttpRequest, HttpResponse } from "./app.js";

/** API Gateway HTTP API（payload format 2.0）のイベントのうち、使う項目だけ */
export interface HttpApiEvent {
  rawPath: string;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: { http: { method: string } };
}

export interface HttpApiResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export function toHttpRequest(event: HttpApiEvent): HttpRequest {
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    headers[key.toLowerCase()] = value;
  }
  const body =
    event.body !== undefined && event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
  const request: HttpRequest = { method: event.requestContext.http.method, path: event.rawPath, headers };
  if (body !== undefined) request.body = body;
  return request;
}

export function toHttpApiResult(response: HttpResponse): HttpApiResult {
  return { statusCode: response.statusCode, headers: response.headers, body: response.body };
}
