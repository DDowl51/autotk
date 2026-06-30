import http from "node:http";
import os from "node:os";
import { createReadStream, promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

// 局域网直传：起一个本地 HTTP，把视频按一次性 token 提供给同网手机下载。
// 跨网时由 Hub 中转（3B），这里只管同网直传。

const CT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
};

export class LanFileServer {
  private server: http.Server | null = null;
  private readonly tokens = new Map<string, string>(); // token → absPath
  private port = 0;

  /** 注册一个文件，返回访问 token（幂等：同路径复用同 token）。 */
  register(absPath: string): string {
    for (const [t, p] of this.tokens) if (p === absPath) return t;
    const token = randomBytes(12).toString("hex");
    this.tokens.set(token, absPath);
    return token;
  }

  /** 拼出手机用的下载 URL。lanHost 传操作员机器的局域网 IP。 */
  urlFor(token: string, lanHost: string): string {
    return `http://${lanHost}:${this.port}/f/${token}`;
  }

  getPort(): number {
    return this.port;
  }

  start(host = "0.0.0.0", port = 0): Promise<number> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this.handle(req, res));
      this.server.listen(port, host, () => {
        const addr = this.server!.address();
        this.port = typeof addr === "object" && addr ? addr.port : port;
        resolve(this.port);
      });
    });
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const m = (req.url ?? "").match(/^\/f\/([a-f0-9]+)$/);
    const absPath = m ? this.tokens.get(m[1]) : undefined;
    if (!absPath) {
      res.writeHead(404).end("not found");
      return;
    }
    try {
      const st = await fs.stat(absPath);
      res.writeHead(200, {
        "Content-Type": CT[path.extname(absPath).toLowerCase()] ?? "application/octet-stream",
        "Content-Length": String(st.size),
      });
      createReadStream(absPath).pipe(res);
    } catch {
      res.writeHead(404).end("not found");
    }
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
      this.server = null;
    });
  }
}

/** 取本机第一个非内网回环的 IPv4，供拼 LAN URL。 */
export function lanAddress(): string | undefined {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return undefined;
}
