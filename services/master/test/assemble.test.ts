import { describe, expect, it } from "vitest";
import type { Driver } from "@auto/core";
import { buildPhoneConfigs } from "../src/assemble";
import type { ResolvedConfig, ResolvedDevice } from "../src/config";
import type { ProbeOutcome } from "../src/probe";

const SCHED = { allDay: true, windows: [] };
function dev(id: string, size?: { width: number; height: number }): ResolvedDevice {
  return { id, udid: `U-${id}`, wdaUrl: `http://h/${id}`, name: id, size, params: { p: id }, schedule: SCHED };
}
function cfg(devices: ResolvedDevice[], staggerMs = 1000): ResolvedConfig {
  return { vlm: { url: "http://g", model: "m" }, staggerMs, devices };
}
// 每台一个可辨识的假 driver(buildPhoneConfigs 不调其方法,只透传)。
function fakeDrivers(ids: string[]): { get: (id: string) => Driver; map: Map<string, Driver> } {
  const map = new Map(ids.map((id) => [id, { __id: id } as unknown as Driver]));
  return { get: (id) => map.get(id)!, map };
}

const ok = (id: string, size?: { width: number; height: number }): ProbeOutcome => ({ id, ok: true, size, detail: "ok" });
const down = (id: string): ProbeOutcome => ({ id, ok: false, detail: "unreachable" });

describe("buildPhoneConfigs", () => {
  it("可达台装配:透传 driver/params/schedule,size 用探活值,错峰按序号", () => {
    const devices = [dev("a"), dev("b"), dev("c")];
    const { get, map } = fakeDrivers(["a", "b", "c"]);
    const { configs, skipped } = buildPhoneConfigs(cfg(devices), [ok("a", { width: 375, height: 667 }), ok("b", { width: 390, height: 844 }), ok("c", { width: 375, height: 667 })], get);
    expect(skipped).toEqual([]);
    expect(configs.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(configs.map((c) => c.phaseOffsetMs)).toEqual([0, 1000, 2000]);
    expect(configs[1].driver).toBe(map.get("b"));
    expect(configs[0].size).toEqual({ width: 375, height: 667 });
    expect(configs[0].params).toEqual({ p: "a" });
    expect(configs[0].schedule).toBe(SCHED);
  });

  it("配置显式 size 优先于探活 size", () => {
    const devices = [dev("a", { width: 111, height: 222 })];
    const { configs } = buildPhoneConfigs(cfg(devices), [ok("a", { width: 999, height: 999 })], fakeDrivers(["a"]).get);
    expect(configs[0].size).toEqual({ width: 111, height: 222 });
  });

  it("不可达 / 无探活结果 → 跳过并给原因", () => {
    const devices = [dev("a"), dev("b")];
    const { configs, skipped } = buildPhoneConfigs(cfg(devices), [down("a")], fakeDrivers(["a", "b"]).get); // b 无结果
    expect(configs).toEqual([]);
    expect(skipped).toEqual([{ id: "a", reason: "不可达" }, { id: "b", reason: "无探活结果" }]);
  });

  it("探活未返回分辨率且未配 size → 跳过(不能盲点)", () => {
    const devices = [dev("a")]; // 无 size
    const { configs, skipped } = buildPhoneConfigs(cfg(devices), [ok("a")], fakeDrivers(["a"]).get); // ok 但无 size
    expect(configs).toEqual([]);
    expect(skipped).toEqual([{ id: "a", reason: "未配 size 且探活未返回分辨率" }]);
  });

  it("跳过中间某台后,错峰序号对可达台仍连续(0, stagger, 2*stagger)", () => {
    const devices = [dev("a"), dev("b"), dev("c")];
    const S = { width: 1, height: 1 };
    const { configs } = buildPhoneConfigs(cfg(devices, 500), [ok("a", S), down("b"), ok("c", S)], fakeDrivers(["a", "b", "c"]).get);
    expect(configs.map((c) => c.id)).toEqual(["a", "c"]);
    expect(configs.map((c) => c.phaseOffsetMs)).toEqual([0, 500]); // c 拿 index 1,不因 b 跳过而跳到 1000
  });
});
