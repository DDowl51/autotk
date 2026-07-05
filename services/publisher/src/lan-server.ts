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
      // 流中途出错（文件被删/权限变/IO 故障）：200 头已发、改不了状态码，至少断开避免连接挂死。
      const stream = createReadStream(absPath);
      stream.on("error", () => res.destroy());
      res.on("close", () => stream.destroy());
      stream.pipe(res);
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

// 虚拟机/VPN/容器网卡名关键词（小写子串匹配）：这些网卡也常是 192.168.*，但手机连不上。
// 与 apps/desktop/electron/netutil.cjs 的 VIRTUAL_IF 同义（两包各自独立，故各留一份）。
const VIRTUAL_IF = /vmware|virtualbox|\bvbox\b|vethernet|hyper-?v|tailscale|zerotier|\bwsl\b|docker|\bveth|\butun|\btun\d|\btap\d|npcap|radmin|hamachi|loopback/i;

/**
 * 取本机「手机能连上」的局域网 IPv4，供拼 LAN 下载 URL。
 * 旧实现取「第一个非回环 IPv4」，装了 VMware/Hyper-V/Tailscale 时会挑到手机连不上的虚拟网卡地址
 * （真机实测下载 URL 用了 192.168.163.1/VMware → 手机拿不到视频）。现按网卡名排除虚拟/VPN 网卡、
 * 跳过 APIPA(169.254.*)，优先真·物理网卡的私网段(WLAN/以太网)，逐级兜底。
 */
export function lanAddress(interfaces: ReturnType<typeof os.networkInterfaces> = os.networkInterfaces()): string | undefined {
  const rows: Array<{ addr: string; virtual: boolean }> = [];
  for (const [name, ifaces] of Object.entries(interfaces)) {
    const virtual = VIRTUAL_IF.test(name);
    for (const i of ifaces ?? []) {
      if (i.family === "IPv4" && !i.internal && i.address && !/^169\.254\./.test(i.address)) {
        rows.push({ addr: i.address, virtual });
      }
    }
  }
  const isPriv = (ip: string) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  const realPriv = rows.find((r) => !r.virtual && isPriv(r.addr));
  if (realPriv) return realPriv.addr;
  const real = rows.find((r) => !r.virtual);
  if (real) return real.addr;
  const anyPriv = rows.find((r) => isPriv(r.addr));
  return anyPriv?.addr ?? rows[0]?.addr;
}
