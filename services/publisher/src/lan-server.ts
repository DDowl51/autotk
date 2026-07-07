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

  /**
   * @param persistFile 可选：把 token→路径映射 + 端口落盘的文件。传了它，桌面重启后
   *   restore() 能把旧映射与端口读回来，让**定时/离线补发**任务里持久化的旧下发 URL 仍可下载
   *   （否则重启后 token（内存）与随机端口都变，手机拿旧 URL 必 404）。不传＝老行为、纯内存。
   */
  constructor(private readonly persistFile?: string) {}

  /** 注册一个文件，返回访问 token（幂等：同路径复用同 token）。 */
  register(absPath: string): string {
    for (const [t, p] of this.tokens) if (p === absPath) return t;
    const token = randomBytes(12).toString("hex");
    this.tokens.set(token, absPath);
    void this.persist();
    return token;
  }

  /** 拼出手机用的下载 URL。lanHost 传操作员机器的局域网 IP。 */
  urlFor(token: string, lanHost: string): string {
    return `http://${lanHost}:${this.port}/f/${token}`;
  }

  getPort(): number {
    return this.port;
  }

  /** 从持久化文件恢复 token→路径映射 + 上次端口（供桌面重启后旧 URL 仍可用）。返回上次端口。 */
  async restore(): Promise<number | undefined> {
    if (!this.persistFile) return undefined;
    try {
      const raw = await fs.readFile(this.persistFile, "utf8");
      const data = JSON.parse(raw) as { port?: number; tokens?: Array<[string, string]> };
      if (Array.isArray(data.tokens)) for (const [t, p] of data.tokens) this.tokens.set(t, p);
      return typeof data.port === "number" ? data.port : undefined;
    } catch {
      return undefined; // 首次运行/文件损坏 → 当作没有历史
    }
  }

  private async persist(): Promise<void> {
    if (!this.persistFile) return;
    try {
      await fs.writeFile(this.persistFile, JSON.stringify({ port: this.port, tokens: [...this.tokens] }));
    } catch {
      /* 持久化失败忽略，下次 register/start 再写 */
    }
  }

  /**
   * 起服务。port 传上次端口时优先复用（让旧 URL 里的端口仍命中）；被占用则回退随机端口
   * （旧 URL 会失效，但新发布仍可用，不阻塞）。
   */
  start(host = "0.0.0.0", port = 0): Promise<number> {
    const listenOn = (p: number): Promise<number> =>
      new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => this.handle(req, res));
        const onError = (e: NodeJS.ErrnoException) => reject(e);
        server.once("error", onError);
        server.listen(p, host, () => {
          server.removeListener("error", onError);
          this.server = server;
          const addr = server.address();
          this.port = typeof addr === "object" && addr ? addr.port : p;
          resolve(this.port);
        });
      });
    return listenOn(port)
      .catch(() => (port !== 0 ? listenOn(0) : Promise.reject(new Error("LAN 端口绑定失败"))))
      .then(async (p) => {
        await this.persist(); // 记下实际端口，供下次重启复用
        return p;
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

  async close(): Promise<void> {
    await this.persist(); // 落盘最新 token 映射 + 端口，供下次重启恢复
    await new Promise<void>((resolve) => {
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
