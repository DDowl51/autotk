import { describe, it, expect } from "vitest";
import { DeviceRegistry, statsProgressed } from "../src/domain/registry";
import { MemoryDeviceStore } from "../src/adapters/memory-store";

function mk() {
  let t = 1000;
  const reg = new DeviceRegistry(new MemoryDeviceStore(), () => t);
  return { reg, setTime: (n: number) => (t = n) };
}

describe("DeviceRegistry", () => {
  it("注册 → 在线 + 进快照", async () => {
    const { reg } = mk();
    const info = await reg.register({ deviceId: "d1", deviceName: "手机A", version: "1.0" }, "s1");
    expect(info).toMatchObject({ deviceId: "d1", deviceName: "手机A", online: true, lastSeen: 1000 });
    const snap = await reg.snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0].online).toBe(true);
  });

  it("上报状态：已注册更新，未注册返回 null", async () => {
    const { reg } = mk();
    expect(await reg.updateStatus("ghost", { running: true, ts: 1 })).toBe(null);
    await reg.register({ deviceId: "d1", deviceName: "A" }, "s1");
    const info = await reg.updateStatus("d1", {
      running: true,
      module: "forYou",
      stats: { likes: 3, follows: 1, comments: 0, videos: 5 },
      ts: 2000,
    });
    expect(info?.status?.module).toBe("forYou");
    expect(info?.status?.stats?.likes).toBe(3);
  });

  it("断开 → 离线但仍在快照", async () => {
    const { reg } = mk();
    await reg.register({ deviceId: "d1", deviceName: "A" }, "s1");
    const off = await reg.disconnect("d1", "s1");
    expect(off?.online).toBe(false);
    expect(reg.isOnline("d1")).toBe(false);
    const snap = await reg.snapshot();
    expect(snap[0].online).toBe(false);
  });

  it("statsProgressed：任一增长算进展", () => {
    const s = (v: number) => ({ likes: 0, follows: 0, comments: 0, videos: v });
    expect(statsProgressed(undefined, s(0))).toBe(true); // 首次
    expect(statsProgressed(s(3), s(3))).toBe(false); // 不变
    expect(statsProgressed(s(3), s(4))).toBe(true); // 增长
    expect(statsProgressed(s(3), undefined)).toBe(false); // 无新数据
  });

  it("lastProgressAt：进展时更新，停滞时保持", async () => {
    const { reg, setTime } = mk();
    await reg.register({ deviceId: "d1", deviceName: "A" }, "s1");
    setTime(2000);
    let info = await reg.updateStatus("d1", { running: true, stats: { likes: 0, follows: 0, comments: 0, videos: 1 }, ts: 0 });
    expect(info?.lastProgressAt).toBe(2000);
    setTime(5000);
    info = await reg.updateStatus("d1", { running: true, stats: { likes: 0, follows: 0, comments: 0, videos: 1 }, ts: 0 }); // 停滞
    expect(info?.lastProgressAt).toBe(2000); // 不变
    setTime(9000);
    info = await reg.updateStatus("d1", { running: true, stats: { likes: 0, follows: 0, comments: 0, videos: 2 }, ts: 0 }); // 又进展
    expect(info?.lastProgressAt).toBe(9000);
  });

  it("乱序重连：旧 socket 迟到 disconnect 不误标离线（防幽灵下线）", async () => {
    const { reg } = mk();
    await reg.register({ deviceId: "d1", deviceName: "A" }, "sockA"); // 旧连接
    await reg.register({ deviceId: "d1", deviceName: "A" }, "sockB"); // 新连接（重连，owner→sockB）
    const stale = await reg.disconnect("d1", "sockA"); // 旧连接迟到断开
    expect(stale).toBe(null); // 忽略：不返回可广播的离线 info
    expect(reg.isOnline("d1")).toBe(true); // 仍在线（sockB 拥有）
    const off = await reg.disconnect("d1", "sockB"); // 当前 socket 真断开
    expect(off?.online).toBe(false);
    expect(reg.isOnline("d1")).toBe(false);
  });

  it("remove：清在线态 + 出快照（手机重连会重新出现）", async () => {
    const { reg } = mk();
    await reg.register({ deviceId: "d1", deviceName: "A" }, "s1");
    await reg.register({ deviceId: "d2", deviceName: "B" }, "s2");
    await reg.remove("d1");
    expect(reg.isOnline("d1")).toBe(false); // 在线态已清
    const snap = await reg.snapshot();
    expect(snap.map((d) => d.deviceId)).toEqual(["d2"]); // 从存储移除
    // 重连即重新出现（含改后的上报名）
    await reg.register({ deviceId: "d1", deviceName: "A重连" }, "s3");
    const snap2 = await reg.snapshot();
    expect(snap2.find((d) => d.deviceId === "d1")?.deviceName).toBe("A重连");
  });

  it("重连 → 重新在线 + 更新名字", async () => {
    const { reg } = mk();
    await reg.register({ deviceId: "d1", deviceName: "A" }, "s1");
    await reg.disconnect("d1", "s1");
    await reg.register({ deviceId: "d1", deviceName: "A改名" }, "s2");
    expect(reg.isOnline("d1")).toBe(true);
    const snap = await reg.snapshot();
    expect(snap[0].deviceName).toBe("A改名");
    expect(snap[0].online).toBe(true);
  });
});
