import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AliasStore } from "../src/domain/alias-store";
import { DeviceRegistry } from "../src/domain/registry";
import { MemoryDeviceStore } from "../src/adapters/memory-store";

describe("AliasStore（文件持久化）", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "alias-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("set → 落盘 → 重建后 load 还在", async () => {
    const file = path.join(dir, "aliases.json");
    const a = new AliasStore(file);
    await a.set("d1", "美区-01");
    const b = new AliasStore(file);
    await b.load();
    expect(b.get("d1")).toBe("美区-01");
  });

  it("空串清除别名", async () => {
    const a = new AliasStore(path.join(dir, "a.json"));
    await a.set("d1", "x");
    await a.set("d1", "  ");
    expect(a.get("d1")).toBeUndefined();
  });

  it("纯内存（无文件）也能用", async () => {
    const a = new AliasStore();
    await a.set("d1", "本地");
    expect(a.get("d1")).toBe("本地");
    await a.load(); // 无文件不报错
  });
});

describe("DeviceRegistry × 别名", () => {
  it("有别名时 deviceName 用别名；rename 即时生效", async () => {
    const alias = new AliasStore();
    const reg = new DeviceRegistry(new MemoryDeviceStore(), () => 1000, alias);
    await reg.register({ deviceId: "d1", deviceName: "iPhone", version: "1" }, "s1");

    let snap = await reg.snapshot();
    expect(snap[0].deviceName).toBe("iPhone"); // 未改名 = 上报名

    const info = await reg.rename("d1", "美区-01");
    expect(info?.deviceName).toBe("美区-01");

    snap = await reg.snapshot();
    expect(snap[0].deviceName).toBe("美区-01"); // 快照也跟着变

    await reg.rename("d1", ""); // 清除
    snap = await reg.snapshot();
    expect(snap[0].deviceName).toBe("iPhone"); // 恢复上报名
  });
});
