import { createServer } from "node:http";
import { createApp } from "../../core/src/app.js";
import { GeminiInsightProvider } from "../../core/src/insights/geminiProvider.js";
import { createInMemoryRepositories } from "../../core/src/repositories/inMemory.js";

/**
 * ローカル開発用のサーバー。データはメモリ上にあり、再起動すると消える。
 * 起動時に、すぐ試せるイベントとテーマを1つ作る。
 */
const port = Number(process.env["PORT"] ?? 8787);
const adminToken = process.env["ADMIN_TOKEN"] ?? "local-dev-admin-token";
const repos = createInMemoryRepositories();
const geminiKey = process.env["GEMINI_API_KEY"];
const app = createApp({
  repos,
  adminToken,
  allowedOrigin: process.env["ALLOWED_ORIGIN"] ?? "*",
  // 共通点・相違点・問いの案は、キーがあるときだけ使える
  ...(geminiKey ? { insightProvider: new GeminiInsightProvider({ apiKey: geminiKey }) } : {}),
});

async function seed(): Promise<string> {
  const call = (method: string, path: string, body?: unknown) =>
    app.handleRequest({
      method,
      path,
      headers: { authorization: `Bearer ${adminToken}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const event = JSON.parse((await call("POST", "/events", { name: "ローカル確認用イベント" })).body);
  await call("PATCH", `/events/${event.id}`, { status: "active" });
  const session = JSON.parse(
    (await call("POST", `/events/${event.id}/sessions`, { title: "確認用テーマ", prompt: "いま感じていることを教えてください" })).body,
  );
  await call("PATCH", `/sessions/${session.id}`, { status: "active" });
  return session.id as string;
}

const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  let size = 0;
  req.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size <= 1024 * 1024) chunks.push(chunk);
  });
  req.on("end", async () => {
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      headers[key.toLowerCase()] = Array.isArray(value) ? value.join(",") : value;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    const body = Buffer.concat(chunks).toString("utf8");
    const response = await app.handleRequest({
      method: req.method ?? "GET",
      path: url.pathname,
      headers,
      ...(body === "" ? {} : { body }),
    });
    res.writeHead(response.statusCode, response.headers);
    res.end(response.body);
  });
});

seed().then((sessionId) => {
  server.listen(port, () => {
    console.log(`API: http://localhost:${port}`);
    console.log(`運営者トークン: ${adminToken}`);
    console.log(`参加者の画面で使うテーマID: ${sessionId}`);
  });
});
