import type { IncomingMessage, ServerResponse } from "node:http";
import { ingest } from "./ingest";
import type { EventStore } from "./ports";

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 5 * 1024 * 1024) return; // 5MB 上限，超了忽略后续
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

const json = (res: ServerResponse, code: number, body: unknown) =>
  res
    .writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
    .end(JSON.stringify(body));

/**
 * 采集服务 HTTP 处理函数（注入 store，便于测试）。
 *   POST /v1/events  收事件 → { accepted, rejected }
 *   GET  /health     健康
 *   GET  /v1/stats   总条数（看板雏形）
 */
export function createHandler(store: EventStore) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method === "OPTIONS") {
      res
        .writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        })
        .end();
      return;
    }
    const [url, qs] = (req.url ?? "").split("?");
    const query = new URLSearchParams(qs ?? "");
    const num = (k: string, dflt: number) => {
      const v = Number(query.get(k));
      return Number.isFinite(v) && v > 0 ? v : dflt;
    };

    if (req.method === "GET" && url === "/health") {
      json(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && url === "/v1/stats") {
      json(res, 200, { total: await store.count() });
      return;
    }
    if (req.method === "GET" && url === "/v1/stats/summary") {
      const since = Number(query.get("since")) || 0;
      json(res, 200, await store.summary(since));
      return;
    }
    if (req.method === "GET" && url === "/v1/stats/series") {
      const bucket = num("bucket", 3600_000); // 默认按小时
      const since = Number(query.get("since")) || 0;
      json(res, 200, { bucketMs: bucket, points: await store.series(bucket, since) });
      return;
    }
    if (req.method === "POST" && url === "/v1/events") {
      const body = await readJson(req);
      if (!body || typeof body !== "object") {
        json(res, 400, { error: "bad json" });
        return;
      }
      try {
        const r = await ingest(body, store, Date.now());
        json(res, 200, r);
      } catch {
        json(res, 500, { error: "store failed" });
      }
      return;
    }
    res.writeHead(404, { "Access-Control-Allow-Origin": "*" }).end();
  };
}
