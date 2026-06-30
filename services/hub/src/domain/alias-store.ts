import { promises as fs } from "node:fs";
import path from "node:path";

// 设备别名（操作员改的名）：按 deviceId 存，落 JSON 文件，重启不丢。
// 不传 file 则纯内存（测试/无持久化场景）。

export class AliasStore {
  private readonly map = new Map<string, string>();

  constructor(private readonly file?: string) {}

  /** 启动时从文件加载（文件不存在/损坏则空）。 */
  async load(): Promise<void> {
    if (!this.file) return;
    try {
      const raw = await fs.readFile(this.file, "utf8");
      const obj = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) if (typeof v === "string") this.map.set(k, v);
    } catch {
      /* 没有就空 */
    }
  }

  get(deviceId: string): string | undefined {
    return this.map.get(deviceId);
  }

  all(): Record<string, string> {
    return Object.fromEntries(this.map);
  }

  /** 设别名（空串=清除）。立即持久化。 */
  async set(deviceId: string, alias: string): Promise<void> {
    const a = alias.trim();
    if (a) this.map.set(deviceId, a);
    else this.map.delete(deviceId);
    await this.persist();
  }

  private async persist(): Promise<void> {
    if (!this.file) return;
    try {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(this.file, JSON.stringify(this.all(), null, 2), "utf8");
    } catch {
      /* 持久化失败忽略 */
    }
  }
}
