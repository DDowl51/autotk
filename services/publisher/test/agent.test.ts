import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { planDevice } from "../src/plan";
import { PublishAgent } from "../src/agent";
import { LanFileServer } from "../src/lan-server";
import { emptyManifest, markPublished } from "../src/dedup";
import type { VideoItem } from "../src/types";

const vid = (fileName: string, size = 1): VideoItem => ({
  deviceName: "d",
  fileName,
  absPath: `/x/${fileName}`,
  size,
  mtimeMs: 0,
});
const allDaySched = { allDay: true, taskWindows: [], dayStartMs: 0, jitterSec: 0 };

describe("planDevice (纯函数)", () => {
  it("去重 + 文案解析 + 排程时刻递增", () => {
    let m = emptyManifest();
    m = markPublished(m, vid("a.mp4"));
    const plan = planDevice({
      items: [vid("a.mp4"), vid("b.mp4"), vid("c.mp4")],
      manifest: m,
      captionsText: "b.mp4 = 来自captions",
      sameNameTxts: { "c.mp4": "同名文案" },
      schedule: allDaySched,
    });
    expect(plan.map((p) => p.fileName)).toEqual(["b.mp4", "c.mp4"]); // a 已发被去掉
    expect(plan.find((p) => p.fileName === "b.mp4")!.caption).toBe("来自captions");
    expect(plan.find((p) => p.fileName === "c.mp4")!.caption).toBe("同名文案");
    expect(plan[0].scheduledAt).toBeLessThan(plan[1].scheduledAt); // 排程递增
  });
});

describe("PublishAgent (真文件系统 + 真 LAN)", () => {
  let root: string;
  let agent: PublishAgent;
  let lan: LanFileServer;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-"));
    const a = path.join(root, "手机A");
    await fs.mkdir(a, { recursive: true });
    await fs.writeFile(path.join(a, "v1.mp4"), "AAAA");
    await fs.writeFile(path.join(a, "v2.mp4"), "BBBBBB");
    await fs.writeFile(path.join(a, "captions.txt"), "v1.mp4 = 第一条");
    lan = new LanFileServer();
    await lan.start("127.0.0.1", 0);
    agent = new PublishAgent({ rootDir: root, schedule: allDaySched, lan, lanHost: "127.0.0.1" });
  });
  afterEach(async () => {
    await lan.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("refresh 给出待发计划（含文案、已发数）", async () => {
    const plans = await agent.refresh();
    const a = plans.find((p) => p.deviceName === "手机A")!;
    expect(a.pending.map((p) => p.fileName)).toEqual(["v1.mp4", "v2.mp4"]);
    expect(a.pending.find((p) => p.fileName === "v1.mp4")!.caption).toBe("第一条");
    expect(a.publishedCount).toBe(0);
  });

  it("markPublished 后 refresh 不再列出、已发数 +1", async () => {
    await agent.markPublished("手机A", "v1.mp4");
    const plans = await agent.refresh();
    const a = plans.find((p) => p.deviceName === "手机A")!;
    expect(a.pending.map((p) => p.fileName)).toEqual(["v2.mp4"]);
    expect(a.publishedCount).toBe(1);
  });

  it("prepareSource lan → 手机用直链取到字节", async () => {
    const src = await agent.prepareSource("手机A", "v1.mp4", "lan");
    expect(src.kind).toBe("lan");
    const res = await fetch(src.url);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("AAAA");
  });

  it("prepareSource relay 缺 Hub 地址 → 报错", async () => {
    await expect(agent.prepareSource("手机A", "v1.mp4", "relay")).rejects.toThrow(/Hub/);
  });

  it("renameDeviceFolder：旧文件夹连内容一起改名", async () => {
    await agent.renameDeviceFolder("手机A", "美区-01");
    const plans = await agent.refresh();
    expect(plans.find((p) => p.deviceName === "手机A")).toBeUndefined();
    const renamed = plans.find((p) => p.deviceName === "美区-01");
    expect(renamed?.pending.map((p) => p.fileName)).toEqual(["v1.mp4", "v2.mp4"]); // 视频跟着搬过去
  });

  it("renameDeviceFolder：旧文件夹不存在则建新的", async () => {
    await agent.renameDeviceFolder("不存在", "新机");
    expect((await fs.stat(path.join(root, "新机"))).isDirectory()).toBe(true);
  });
});
