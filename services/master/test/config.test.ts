import { describe, expect, it } from "vitest";
import { DEFAULT_WINDOWS } from "@auto/core";
import { tiktokPlugin } from "@auto/plugin-tiktok";
import { deepMerge, mergeDiscoveredEntries, parseConfig, type DeviceEntry, type MasterConfigFile } from "../src/config";
import type { Discovered } from "../src/discovery";

// 用真插件的默认值/校验器 —— 同时验证合并结果仍是插件合法参数。
const hooks = { defaultParams: tiktokPlugin.defaultParams, validateParams: tiktokPlugin.validateParams };
const parse = (raw: unknown) => parseConfig(raw, hooks);

const minimal: MasterConfigFile = {
  vlm: { url: "http://gpu:8000" },
  devices: [{ id: "d1", udid: "UDID-1", host: "192.168.1.51" }],
};

describe("mergeDiscoveredEntries(局域网自动发现)", () => {
  const disc = (host: string, w = 375, h = 667): Discovered => ({ host, port: 8100, wdaUrl: `http://${host}:8100`, size: { width: w, height: h } });

  it("空配置 + 发现两台 → 用 IP 当身份合成条目(auto-/ip-)", () => {
    const out = mergeDiscoveredEntries([], [disc("192.168.11.229"), disc("192.168.11.230")]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "auto-229", udid: "ip-192.168.11.229", host: "192.168.11.229", name: "192.168.11.229", size: { width: 375, height: 667 } });
    expect(out[1].id).toBe("auto-230");
  });

  it("发现的手机已在配置里(按 host 匹配)→ 保留配置的 id/udid/name,补探到的 size", () => {
    const cfg: DeviceEntry[] = [{ id: "01", udid: "REAL-UDID", host: "192.168.11.229", name: "iPhone-01" }];
    const out = mergeDiscoveredEntries(cfg, [disc("192.168.11.229")]);
    expect(out).toHaveLength(1); // 不重复
    expect(out[0]).toMatchObject({ id: "01", udid: "REAL-UDID", name: "iPhone-01", size: { width: 375, height: 667 } });
  });

  it("配置里已有 size → 不被发现的覆盖", () => {
    const cfg: DeviceEntry[] = [{ id: "01", udid: "U", host: "1.1.1.1", size: { width: 1170, height: 2532 } }];
    const out = mergeDiscoveredEntries(cfg, [disc("1.1.1.1", 375, 667)]);
    expect(out[0].size).toEqual({ width: 1170, height: 2532 });
  });

  it("配置有、但没被发现的条目保留(可能离线)", () => {
    const cfg: DeviceEntry[] = [{ id: "01", udid: "U", host: "1.1.1.1" }];
    const out = mergeDiscoveredEntries(cfg, [disc("2.2.2.2")]);
    expect(out.map((e) => e.host)).toEqual(["1.1.1.1", "2.2.2.2"]);
  });

  it("合并结果能过 parseConfig(发现的手机成为合法设备)", () => {
    const raw: MasterConfigFile = { vlm: { url: "http://gpu:8000" }, devices: mergeDiscoveredEntries([], [disc("192.168.11.229")]) };
    const cfg = parse(raw);
    expect(cfg.devices).toHaveLength(1);
    expect(cfg.devices[0].wdaUrl).toBe("http://192.168.11.229:8100");
  });
});

describe("deepMerge", () => {
  it("嵌套对象逐键合并;数组与标量整体替换", () => {
    const base = { a: 1, b: { x: 1, y: 2 }, arr: [1, 2] };
    const over = { b: { y: 9, z: 3 }, arr: [7] };
    expect(deepMerge(base, over)).toEqual({ a: 1, b: { x: 1, y: 9, z: 3 }, arr: [7] });
  });
  it("over 为 undefined → 返回 base 原样", () => {
    const base = { a: 1 };
    expect(deepMerge(base, undefined)).toBe(base);
  });
});

describe("parseConfig", () => {
  it("最小配置:拼 wdaUrl、补默认(port/model/stagger/name)、参数=插件默认", () => {
    const c = parse(minimal);
    expect(c.vlm).toEqual({ url: "http://gpu:8000", model: "locateanything-3b", timeoutMs: undefined });
    expect(c.staggerMs).toBe(3000);
    expect(c.devices).toHaveLength(1);
    const d = c.devices[0];
    expect(d.wdaUrl).toBe("http://192.168.1.51:8100");
    expect(d.name).toBe("d1"); // name 缺省=id
    expect(d.schedule).toEqual({ allDay: false, windows: DEFAULT_WINDOWS });
    expect(d.params).toEqual(tiktokPlugin.defaultParams);
  });

  it("自定义 port 进 wdaUrl", () => {
    const c = parse({ ...minimal, devices: [{ id: "d1", udid: "U1", host: "10.0.0.9", port: 8200 }] });
    expect(c.devices[0].wdaUrl).toBe("http://10.0.0.9:8200");
  });

  it("每台参数深合并覆盖全局与插件默认(只改一处,其余保留)", () => {
    const c = parse({
      ...minimal,
      params: { searchKeywords: ["cat"], clickWaitTime: 2 },
      devices: [{ id: "d1", udid: "U1", host: "1.1.1.1", params: { dm: { dmDailyCap: 5 } } }],
    });
    const p = c.devices[0].params as typeof tiktokPlugin.defaultParams & {
      searchKeywords: string[];
      clickWaitTime: number;
      dm: { dmDailyCap: number; dmEnable: boolean };
    };
    expect(p.searchKeywords).toEqual(["cat"]); // 来自全局
    expect(p.clickWaitTime).toBe(2); // 来自全局
    expect(p.dm.dmDailyCap).toBe(5); // 来自每台
    expect(p.dm.dmEnable).toBe(false); // 插件默认保留(深合并未动)
  });

  it("每台 params 非法 → 抛错且带 id", () => {
    expect(() => parse({ ...minimal, devices: [{ id: "bad", udid: "U1", host: "1.1.1.1", params: { clickWaitTime: 0 } }] })).toThrow(/bad.*clickWaitTime/s);
  });

  it("全局时段默认为 DEFAULT_WINDOWS(非全天)", () => {
    expect(parse(minimal).devices[0].schedule).toEqual({ allDay: false, windows: DEFAULT_WINDOWS });
  });

  it("每台时段覆盖全局并被校验", () => {
    const c = parse({ ...minimal, devices: [{ id: "d1", udid: "U1", host: "1.1.1.1", schedule: { allDay: true, windows: [] } }] });
    expect(c.devices[0].schedule).toEqual({ allDay: true, windows: [] });
  });

  it("非法时段(start≥end)→ 抛错", () => {
    expect(() => parse({ ...minimal, schedule: { allDay: false, windows: [{ start: "10:00:00", end: "09:00:00" }] } })).toThrow(/start/);
  });

  it("显式 size 保留;非正整数 size 抛错", () => {
    expect(parse({ ...minimal, devices: [{ id: "d1", udid: "U1", host: "1.1.1.1", size: { width: 375, height: 667 } }] }).devices[0].size).toEqual({ width: 375, height: 667 });
    expect(() => parse({ ...minimal, devices: [{ id: "d1", udid: "U1", host: "1.1.1.1", size: { width: 0, height: 667 } }] })).toThrow(/size/);
  });

  it("缺 vlm.url / 空 devices / 非对象根 → 各自抛错", () => {
    expect(() => parse({ devices: minimal.devices })).toThrow(/vlm\.url/);
    expect(() => parse({ vlm: { url: "http://g:8000" }, devices: [] })).toThrow(/至少 1 台/);
    expect(() => parse(null)).toThrow(/对象/);
  });

  it("缺 udid / 缺 host / 非法 port → 各自抛错(带 id)", () => {
    expect(() => parse({ ...minimal, devices: [{ id: "d1", host: "1.1.1.1" } as never] })).toThrow(/d1.*udid/s);
    expect(() => parse({ ...minimal, devices: [{ id: "d1", udid: "U1" } as never] })).toThrow(/d1.*host/s);
    expect(() => parse({ ...minimal, devices: [{ id: "d1", udid: "U1", host: "1.1.1.1", port: 70000 }] })).toThrow(/port/);
  });

  it("重复 id / udid / 同 IP:port → 各自抛错", () => {
    expect(() => parse({ ...minimal, devices: [{ id: "x", udid: "U1", host: "1.1.1.1" }, { id: "x", udid: "U2", host: "2.2.2.2" }] })).toThrow(/重复 id/);
    expect(() => parse({ ...minimal, devices: [{ id: "a", udid: "U", host: "1.1.1.1" }, { id: "b", udid: "U", host: "2.2.2.2" }] })).toThrow(/重复 udid/);
    expect(() => parse({ ...minimal, devices: [{ id: "a", udid: "U1", host: "1.1.1.1" }, { id: "b", udid: "U2", host: "1.1.1.1" }] })).toThrow(/重复地址/);
  });

  it("staggerMs 负数 → 抛错", () => {
    expect(() => parse({ ...minimal, staggerMs: -1 })).toThrow(/staggerMs/);
  });
});
