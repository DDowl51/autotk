import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * 账号设备集落盘：把「每个账号注册了哪些 UDID」持久化，避免重启丢额度账。
 * 形状：{ [accountName]: udid[] }。原子写（tmp + rename）。
 */

export interface DevicePersistence {
  load(): Promise<Record<string, string[]>>;
  save(devicesByAccount: Record<string, string[]>): Promise<void>;
}

interface Io {
  readText: (path: string) => Promise<string>;
  writeText: (path: string, data: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  mkdirp: (dir: string) => Promise<void>;
}
const defaultIo: Io = {
  readText: (p) => readFile(p, "utf8"),
  writeText: (p, d) => writeFile(p, d, "utf8"),
  rename,
  mkdirp: (dir) => mkdir(dir, { recursive: true }).then(() => undefined),
};

export class FileDevicePersistence implements DevicePersistence {
  constructor(
    private readonly path: string,
    private readonly io: Io = defaultIo,
  ) {}

  async load(): Promise<Record<string, string[]>> {
    try {
      const text = await this.io.readText(this.path);
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const out: Record<string, string[]> = {};
      for (const [name, val] of Object.entries(parsed)) {
        if (Array.isArray(val)) out[name] = val.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
      }
      return out;
    } catch {
      // 文件不存在/损坏 → 当作空（首次运行）。
      return {};
    }
  }

  async save(devicesByAccount: Record<string, string[]>): Promise<void> {
    await this.io.mkdirp(dirname(this.path));
    const tmp = `${this.path}.tmp`;
    await this.io.writeText(tmp, JSON.stringify(devicesByAccount, null, 2));
    await this.io.rename(tmp, this.path);
  }
}
