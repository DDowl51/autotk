import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileDevicePersistence } from "../src/adapters/device-persistence";
import { OtaStore } from "../src/adapters/ota-store";

describe("FileDevicePersistence", () => {
  it("save → load 往返；UDID 归一小写", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ss-"));
    const p = new FileDevicePersistence(join(dir, "sub", "ota-devices.json")); // 目录自动建
    await p.save({ a: ["UDID-1", "Udid-2"], b: [] });
    expect(await p.load()).toEqual({ a: ["udid-1", "udid-2"], b: [] });
  });

  it("文件不存在 → 返回空对象", async () => {
    const p = new FileDevicePersistence("/nonexistent/dir/x.json");
    expect(await p.load()).toEqual({});
  });
});

describe("OtaStore 持久化钩子", () => {
  it("saveAccount 触发 persist，快照含全部账号设备集", async () => {
    const snaps: Record<string, string[]>[] = [];
    const store = new OtaStore(
      [{ name: "a", capacity: 100, devices: [] }],
      Date.now,
      async (snap) => {
        snaps.push(snap);
      },
    );
    await store.saveAccount({ name: "a", capacity: 100, devices: ["udid-1"] });
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toEqual({ a: ["udid-1"] });
  });

  it("没传 persist → saveAccount 不报错", async () => {
    const store = new OtaStore([{ name: "a", capacity: 100, devices: [] }]);
    await expect(store.saveAccount({ name: "a", capacity: 100, devices: ["x"] })).resolves.toBeUndefined();
  });
});
