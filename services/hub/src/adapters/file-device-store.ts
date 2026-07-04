import { promises as fs } from "node:fs";
import path from "node:path";
import type { DeviceStatus } from "@mc/shared";
import type { DeviceRecord, DeviceStore } from "../domain/ports";

/**
 * 文件版 DeviceStore：设备记录落 JSON，Hub（内嵌桌面 App）重启后设备列表还在
 * （名字/版本/最近状态），不必等所有手机重连才有列表。不传 file 则纯内存（测试用）。
 *
 * 写盘节流：
 *  - 注册（upsert，稀有）立即落盘，保证「刚上线的新设备」不因随即崩溃而丢；
 *  - 状态上报（setStatus，高频：每台每几秒×几百台）走去抖——标记后起一个一次性定时器，
 *    flushMs 内多次改动合并成一次写，避免打爆磁盘；
 *  - 所有写经同一条 Promise 链串行化，杜绝并发 writeFile 交错写坏文件；
 *  - close() 停定时器并最后落一次（优雅关闭时用）。
 */
export class FileDeviceStore implements DeviceStore {
  private readonly m = new Map<string, DeviceRecord>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly file?: string,
    private readonly flushMs = 3000,
  ) {}

  /** 启动时从文件加载（文件不存在/损坏则空）。 */
  async load(): Promise<void> {
    if (!this.file) return;
    try {
      const raw = await fs.readFile(this.file, "utf8");
      const arr = JSON.parse(raw) as DeviceRecord[];
      if (Array.isArray(arr)) {
        for (const r of arr) if (r && typeof r.deviceId === "string") this.m.set(r.deviceId, r);
      }
    } catch {
      /* 没有/损坏就空 */
    }
  }

  async upsert(r: {
    deviceId: string;
    deviceName: string;
    version?: string;
    lastSeen: number;
  }): Promise<void> {
    const cur = this.m.get(r.deviceId);
    this.m.set(r.deviceId, {
      deviceId: r.deviceId,
      deviceName: r.deviceName,
      version: r.version,
      lastSeen: r.lastSeen,
      status: cur?.status,
      lastProgressAt: cur?.lastProgressAt,
    });
    await this.flush(); // 注册稀有，立即落盘（新设备不丢）
  }

  async setStatus(
    deviceId: string,
    status: DeviceStatus,
    lastSeen: number,
    lastProgressAt: number | undefined,
  ): Promise<void> {
    const cur = this.m.get(deviceId);
    if (!cur) return;
    this.m.set(deviceId, { ...cur, status, lastSeen, lastProgressAt });
    this.scheduleFlush(); // 高频 → 去抖落盘
  }

  async get(deviceId: string): Promise<DeviceRecord | null> {
    return this.m.get(deviceId) ?? null;
  }

  async list(): Promise<DeviceRecord[]> {
    return [...this.m.values()];
  }

  /** 停去抖定时器并最后落一次（优雅关闭）。 */
  async close(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  private scheduleFlush(): void {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.flushMs);
    this.timer.unref?.(); // 别因这个定时器吊住进程退出
  }

  private flush(): Promise<void> {
    if (!this.file) return Promise.resolve();
    const file = this.file;
    // 串行化：接到上一次写之后，写「当下」的全量快照。
    this.chain = this.chain.then(async () => {
      try {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify([...this.m.values()], null, 2), "utf8");
      } catch {
        /* 写失败忽略：下一次写会带上最新全量 */
      }
    });
    return this.chain;
  }
}
