import { describe, it, expect } from "vitest";
import {
  pickAccountForUdid,
  withDeviceRegistered,
  freeCapacity,
  poolFreeCapacity,
  normalizeUdid,
  hasDevice,
  type PoolAccount,
} from "../src/core/account-pool";

const mk = (name: string, capacity: number, devices: string[] = []): PoolAccount => ({
  name,
  capacity,
  devices,
});

describe("normalizeUdid", () => {
  it("去空白 + 小写", () => {
    expect(normalizeUdid("  AB12Cd \n")).toBe("ab12cd");
  });
});

describe("pickAccountForUdid", () => {
  it("已注册过该 UDID 的账号优先，标记 alreadyRegistered", () => {
    const accts = [mk("a", 100, ["udid-1"]), mk("b", 100)];
    expect(pickAccountForUdid(accts, "UDID-1")).toEqual({
      ok: true,
      account: "a",
      alreadyRegistered: true,
    });
  });

  it("新设备分到剩余名额最多的账号", () => {
    const accts = [mk("a", 100, new Array(90).fill("x")), mk("b", 100, new Array(10).fill("y"))];
    expect(pickAccountForUdid(accts, "new")).toEqual({
      ok: true,
      account: "b",
      alreadyRegistered: false,
    });
  });

  it("并列时取靠前账号（确定性）", () => {
    const accts = [mk("a", 100), mk("b", 100)];
    expect(pickAccountForUdid(accts, "new").ok && pickAccountForUdid(accts, "new")).toMatchObject({
      account: "a",
    });
  });

  it("全满返回 pool-full", () => {
    const accts = [mk("a", 1, ["x"]), mk("b", 2, ["y", "z"])];
    expect(pickAccountForUdid(accts, "new")).toEqual({ ok: false, reason: "pool-full" });
  });

  it("已满但该 UDID 已注册，仍能命中（不受满额影响）", () => {
    const accts = [mk("a", 1, ["keep"])];
    expect(pickAccountForUdid(accts, "keep")).toMatchObject({ account: "a", alreadyRegistered: true });
  });

  it("空 UDID 抛错", () => {
    expect(() => pickAccountForUdid([mk("a", 100)], "  ")).toThrow();
  });
});

describe("withDeviceRegistered", () => {
  it("注册后返回新对象，原对象不变（不可变）", () => {
    const a = mk("a", 100, ["x"]);
    const a2 = withDeviceRegistered(a, "Y");
    expect(a.devices).toEqual(["x"]);
    expect(a2.devices).toEqual(["x", "y"]);
    expect(freeCapacity(a2)).toBe(98);
  });

  it("重复注册幂等（原样返回）", () => {
    const a = mk("a", 100, ["x"]);
    expect(withDeviceRegistered(a, "X")).toBe(a);
  });

  it("满额再注册抛错", () => {
    expect(() => withDeviceRegistered(mk("a", 1, ["x"]), "y")).toThrow(/满/);
  });
});

describe("辅助", () => {
  it("hasDevice 大小写无关", () => {
    expect(hasDevice(mk("a", 100, ["abc"]), "ABC")).toBe(true);
  });
  it("poolFreeCapacity 累加且不计负数", () => {
    const accts = [mk("a", 100, new Array(100).fill("x")), mk("b", 100, new Array(40).fill("y"))];
    expect(poolFreeCapacity(accts)).toBe(60);
  });
});
