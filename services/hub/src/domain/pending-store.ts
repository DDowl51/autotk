import { promises as fs } from "node:fs";
import path from "node:path";
import type { ConfigPatch, PublishTaskMsg } from "@mc/shared";

/** 一条积压的下发（目标设备离线时排队，设备重连即补发）。 */
export type PendingItem =
  | { kind: "config"; jobId: string; patch: ConfigPatch }
  | { kind: "publish"; task: PublishTaskMsg };

/** 单台积压上限：超了丢最旧，防离线设备无限堆积撑爆内存/磁盘。 */
const MAX_PER_DEVICE = 50;

/**
 * 「待补发」队列：下发配置 / 发布任务时若目标设备离线 → 按 deviceId 入队、落 JSON；
 * 该设备（重）连上时（register）全部取出重新下发。重启不丢（Hub 是内嵌桌面 App，会重启）。
 * 不传 file 则纯内存（测试 / e2e）。所有写经同一条 Promise 链串行化，避免并发写坏文件。
 */
export class PendingStore {
  private readonly m = new Map<string, PendingItem[]>();
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly file?: string) {}

  /** 启动时从文件加载（文件不存在/损坏则空）。 */
  async load(): Promise<void> {
    if (!this.file) return;
    try {
      const raw = await fs.readFile(this.file, "utf8");
      const obj = JSON.parse(raw) as Record<string, PendingItem[]>;
      for (const [k, v] of Object.entries(obj)) if (Array.isArray(v) && v.length) this.m.set(k, v);
    } catch {
      /* 没有/损坏就空 */
    }
  }

  async enqueueConfig(deviceId: string, jobId: string, patch: ConfigPatch): Promise<void> {
    this.push(deviceId, { kind: "config", jobId, patch });
    await this.persist();
  }

  async enqueuePublish(deviceId: string, task: PublishTaskMsg): Promise<void> {
    this.push(deviceId, { kind: "publish", task });
    await this.persist();
  }

  /** 取出并清空某设备的全部积压（重连补发时用）。无积压返回空数组。 */
  async take(deviceId: string): Promise<PendingItem[]> {
    const items = this.m.get(deviceId);
    if (!items || items.length === 0) return [];
    this.m.delete(deviceId);
    await this.persist();
    return items;
  }

  /** 某设备当前积压条数（测试/可观测用）。 */
  count(deviceId: string): number {
    return this.m.get(deviceId)?.length ?? 0;
  }

  private push(deviceId: string, item: PendingItem): void {
    const arr = this.m.get(deviceId) ?? [];
    arr.push(item);
    while (arr.length > MAX_PER_DEVICE) arr.shift(); // 丢最旧
    this.m.set(deviceId, arr);
  }

  private persist(): Promise<void> {
    if (!this.file) return Promise.resolve();
    const file = this.file;
    this.chain = this.chain.then(async () => {
      try {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify(Object.fromEntries(this.m), null, 2), "utf8");
      } catch {
        /* 写失败忽略 */
      }
    });
    return this.chain;
  }
}
