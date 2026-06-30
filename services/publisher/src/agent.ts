import path from "node:path";
import { promises as fs } from "node:fs";
import { scanRoot, scanDeviceFolder, readCaptionsTxt, readSameNameTxt } from "./scan";
import { loadManifest, saveManifest } from "./manifest";
import { markPublished } from "./dedup";
import { planDevice, type ScheduleInput } from "./plan";
import { LanFileServer, lanAddress } from "./lan-server";
import type { VideoItem, PublishPlanItem } from "./types";

// 操作员侧「发布代理」：把扫描/去重/文案/排程/局域网直传/中转/去重落盘编排成一个对象，
// 供 Electron 主进程薄封装调用（fs + LAN 在主进程，UI 通过 IPC）。

export interface DevicePlan {
  deviceName: string;
  pending: PublishPlanItem[];
  publishedCount: number;
}

export interface PublishSource {
  kind: "lan" | "relay";
  url: string;
}

export interface PublishAgentOpts {
  rootDir: string;
  schedule: ScheduleInput;
  lan?: LanFileServer; // 局域网直传服务（同网模式必需）
  lanHost?: string; // 局域网 IP；不传则自动探测
}

export class PublishAgent {
  private plans: DevicePlan[] = [];

  constructor(private opts: PublishAgentOpts) {}

  get rootDir(): string {
    return this.opts.rootDir;
  }
  setRoot(dir: string): void {
    this.opts.rootDir = dir;
  }
  setSchedule(schedule: ScheduleInput): void {
    this.opts.schedule = schedule;
  }

  /** 扫描根目录，算出各设备待发计划。 */
  async refresh(): Promise<DevicePlan[]> {
    const items = await scanRoot(this.opts.rootDir);
    const byDevice = new Map<string, VideoItem[]>();
    for (const it of items) {
      const arr = byDevice.get(it.deviceName) ?? [];
      arr.push(it);
      byDevice.set(it.deviceName, arr);
    }
    const plans: DevicePlan[] = [];
    for (const [deviceName, devItems] of byDevice) {
      const dir = path.join(this.opts.rootDir, deviceName);
      const manifest = await loadManifest(dir);
      const captionsText = await readCaptionsTxt(dir);
      const sameNameTxts: Record<string, string> = {};
      for (const it of devItems) {
        const t = await readSameNameTxt(it.absPath);
        if (t) sameNameTxts[it.fileName] = t;
      }
      const pending = planDevice({
        items: devItems,
        manifest,
        captionsText,
        sameNameTxts,
        schedule: this.opts.schedule,
      });
      plans.push({ deviceName, pending, publishedCount: Object.keys(manifest.published).length });
    }
    plans.sort((a, b) => a.deviceName.localeCompare(b.deviceName));
    this.plans = plans;
    return plans;
  }

  plan(): DevicePlan[] {
    return this.plans;
  }

  /**
   * 为某视频准备一个手机可下载的来源：
   * - lan：注册到本机 LAN 服务，返回直链；
   * - relay：把字节 PUT 到 Hub /relay，返回中转链（跨网时用）。
   */
  async prepareSource(
    deviceName: string,
    fileName: string,
    mode: "lan" | "relay",
    hubBase?: string,
  ): Promise<PublishSource> {
    const abs = path.join(this.opts.rootDir, deviceName, fileName);
    if (mode === "relay") {
      if (!hubBase) throw new Error("跨网中转需要 Hub 地址");
      const bytes = await fs.readFile(abs);
      const res = await fetch(`${hubBase.replace(/\/$/, "")}/relay`, {
        method: "POST",
        headers: { "Content-Type": "video/mp4" },
        body: bytes,
      });
      if (!res.ok) throw new Error(`上传到 Hub 失败：HTTP ${res.status}`);
      const { path: p } = (await res.json()) as { path: string };
      return { kind: "relay", url: `${hubBase.replace(/\/$/, "")}${p}` };
    }
    if (!this.opts.lan) throw new Error("局域网直传服务未启动");
    const token = this.opts.lan.register(abs);
    const host = this.opts.lanHost ?? lanAddress() ?? "127.0.0.1";
    return { kind: "lan", url: this.opts.lan.urlFor(token, host) };
  }

  /**
   * 设备改名时同步重命名其视频子文件夹（oldName → newName）。
   * 旧文件夹不存在则建一个新的；新文件夹已存在则不动（避免覆盖）。
   */
  async renameDeviceFolder(oldName: string, newName: string): Promise<void> {
    const from = path.join(this.opts.rootDir, oldName);
    const to = path.join(this.opts.rootDir, newName);
    if (oldName === newName) return;
    try {
      await fs.access(to);
      return; // 目标已存在，不覆盖
    } catch {
      /* 目标不存在，继续 */
    }
    try {
      await fs.rename(from, to);
    } catch {
      // 旧文件夹不存在（手机还没放过视频）→ 建一个新的，省得操作员手动建。
      await fs.mkdir(to, { recursive: true });
    }
  }

  /** 发布成功后登记到该设备清单，下次不再发。 */
  async markPublished(deviceName: string, fileName: string): Promise<void> {
    const dir = path.join(this.opts.rootDir, deviceName);
    const item = (await scanDeviceFolder(dir, deviceName)).find((i) => i.fileName === fileName);
    if (!item) return;
    const manifest = await loadManifest(dir);
    await saveManifest(dir, markPublished(manifest, item));
  }
}
