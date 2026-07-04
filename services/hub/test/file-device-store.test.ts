import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DeviceStatus } from "@mc/shared";
import { FileDeviceStore } from "../src/adapters/file-device-store";

async function tmpFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hub-fds-"));
  return path.join(dir, "devices.json");
}

describe("FileDeviceStore", () => {
  it("upsert 立即落盘 → 重启（新实例 load）后设备列表还在", async () => {
    const file = await tmpFile();
    const s1 = new FileDeviceStore(file);
    await s1.upsert({ deviceId: "d1", deviceName: "手机A", version: "1.0", lastSeen: 1000 });
    await s1.close();

    const s2 = new FileDeviceStore(file);
    await s2.load();
    expect(await s2.get("d1")).toMatchObject({
      deviceId: "d1",
      deviceName: "手机A",
      version: "1.0",
      lastSeen: 1000,
    });
  });

  it("setStatus 去抖，close() 强制落盘后可被 load 读到", async () => {
    const file = await tmpFile();
    const s1 = new FileDeviceStore(file, 50);
    await s1.upsert({ deviceId: "d1", deviceName: "A", lastSeen: 1 });
    const status: DeviceStatus = { running: true, module: "forYou", ts: 2 };
    await s1.setStatus("d1", status, 2, 2);
    await s1.close(); // 停去抖定时器 + 最后落盘

    const s2 = new FileDeviceStore(file);
    await s2.load();
    const r = await s2.get("d1");
    expect(r?.status?.module).toBe("forYou");
    expect(r?.lastProgressAt).toBe(2);
  });

  it("无 file → 纯内存，不写盘也不报错", async () => {
    const s = new FileDeviceStore();
    await s.load();
    await s.upsert({ deviceId: "d1", deviceName: "A", lastSeen: 1 });
    expect((await s.list()).length).toBe(1);
    await s.close();
  });
});
