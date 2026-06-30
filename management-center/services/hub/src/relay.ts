import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";

// 跨网视频中转：操作员机器和手机不同网时，桌面把视频 PUT 到 Hub，Hub 暂存并给一个下载链，
// 转发任务时用该链让手机从 Hub 下载。带 TTL + 总量上限，避免内存涨爆。

interface RelayItem {
  data: Buffer;
  contentType: string;
  expireAt: number;
}

export interface RelayOpts {
  ttlMs?: number; // 暂存有效期，默认 30 分钟
  maxBytes?: number; // 总量上限，超了淘汰最旧，默认 512MB
}

export class RelayStore {
  private readonly items = new Map<string, RelayItem>();
  private bytes = 0;
  private readonly ttlMs: number;
  private readonly maxBytes: number;

  constructor(opts: RelayOpts = {}, private readonly now: () => number = Date.now) {
    this.ttlMs = opts.ttlMs ?? 30 * 60_000;
    this.maxBytes = opts.maxBytes ?? 512 * 1024 * 1024;
  }

  put(data: Buffer, contentType = "application/octet-stream"): string {
    this.prune();
    const id = randomBytes(12).toString("hex");
    this.items.set(id, { data, contentType, expireAt: this.now() + this.ttlMs });
    this.bytes += data.length;
    this.evictIfNeeded();
    return id;
  }

  get(id: string): { data: Buffer; contentType: string } | undefined {
    const it = this.items.get(id);
    if (!it) return undefined;
    if (it.expireAt <= this.now()) {
      this.remove(id);
      return undefined;
    }
    return { data: it.data, contentType: it.contentType };
  }

  get totalBytes(): number {
    return this.bytes;
  }
  get count(): number {
    return this.items.size;
  }

  private remove(id: string): void {
    const it = this.items.get(id);
    if (it) {
      this.bytes -= it.data.length;
      this.items.delete(id);
    }
  }

  private prune(): void {
    const t = this.now();
    for (const [id, it] of this.items) if (it.expireAt <= t) this.remove(id);
  }

  private evictIfNeeded(): void {
    // Map 迭代顺序 = 插入顺序，最旧的在前。
    while (this.bytes > this.maxBytes && this.items.size > 0) {
      const oldest = this.items.keys().next().value as string;
      this.remove(oldest);
    }
  }
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * 把中转的 HTTP 路由挂到一个请求处理函数上：
 *   POST /relay        body=视频字节 → { id, path:"/relay/<id>" }
 *   GET  /relay/:id    → 视频字节（404 表示不存在/过期）
 * 命中则处理并返回 true；否则返回 false（交给其它处理，如 socket.io）。
 */
export function handleRelay(store: RelayStore, req: IncomingMessage, res: ServerResponse): boolean {
  const url = req.url ?? "";
  if (req.method === "POST" && url === "/relay") {
    void readBody(req).then((data) => {
      const id = store.put(data, req.headers["content-type"] ?? "application/octet-stream");
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id, path: `/relay/${id}` }));
    });
    return true;
  }
  const m = url.match(/^\/relay\/([a-f0-9]+)$/);
  if (req.method === "GET" && m) {
    const item = store.get(m[1]);
    if (!item) {
      res.writeHead(404).end("not found");
    } else {
      res.writeHead(200, { "Content-Type": item.contentType, "Content-Length": String(item.data.length) }).end(item.data);
    }
    return true;
  }
  return false;
}
