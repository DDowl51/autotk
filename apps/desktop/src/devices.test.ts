import { describe, it, expect } from "vitest";
import {
  applySnapshot,
  applyUpdate,
  toSorted,
  summarize,
  statusKind,
  filterDevices,
  collectAlerts,
  pushSample,
  batteryTone,
} from "./devices";
import type { DeviceInfo } from "@mc/shared";

const dev = (id: string, over: Partial<DeviceInfo> = {}): DeviceInfo => ({
  deviceId: id,
  deviceName: id,
  online: true,
  lastSeen: 0,
  ...over,
});

describe("batteryTone", () => {
  it("<20% 危险、<50% 偏低、否则正常", () => {
    expect(batteryTone(0)).toBe("danger");
    expect(batteryTone(19)).toBe("danger");
    expect(batteryTone(20)).toBe("warn");
    expect(batteryTone(49)).toBe("warn");
    expect(batteryTone(50)).toBe("ok");
    expect(batteryTone(100)).toBe("ok");
  });
});

describe("devices reducer", () => {
  it("snapshot 建索引，update 覆盖同 id", () => {
    let m = applySnapshot([dev("a"), dev("b")]);
    expect(m.size).toBe(2);
    m = applyUpdate(m, dev("a", { deviceName: "改名" }));
    expect(m.size).toBe(2);
    expect(m.get("a")?.deviceName).toBe("改名");
  });

  it("toSorted：在线优先，再按名字", () => {
    const m = applySnapshot([
      dev("z", { online: true, deviceName: "z" }),
      dev("a", { online: false, deviceName: "a" }),
      dev("m", { online: true, deviceName: "m" }),
    ]);
    const ids = toSorted(m).map((d) => d.deviceId);
    expect(ids).toEqual(["m", "z", "a"]); // 在线(m,z 按名) 然后离线(a)
  });

  it("statusKind：告警 > 疑似卡住 > 运行 > 在线 > 离线", () => {
    expect(statusKind(dev("a", { online: false }))).toBe("offline");
    expect(statusKind(dev("a", { online: true, status: { running: true, alert: "x", ts: 0 } }))).toBe("alert");
    expect(statusKind(dev("a", { online: true, status: { running: true, ts: 0 } }))).toBe("running");
    expect(statusKind(dev("a", { online: true }))).toBe("online");
  });

  it("statusKind：stalled（运行中但超阈值无进展）", () => {
    const d = dev("a", { online: true, lastProgressAt: 1000, status: { running: true, ts: 0 } });
    expect(statusKind(d, { now: 1000 + 4 * 60_000, stalledMs: 5 * 60_000 })).toBe("running");
    expect(statusKind(d, { now: 1000 + 6 * 60_000, stalledMs: 5 * 60_000 })).toBe("stalled");
    // 不传 stalledMs 不判 stalled
    expect(statusKind(d, { now: 9_999_999 })).toBe("running");
  });

  it("summarize：在线/运行/告警 + 累计互动", () => {
    const m = applySnapshot([
      dev("a", { online: true, status: { running: true, stats: { likes: 5, follows: 2, comments: 1, videos: 9 }, ts: 0 } }),
      dev("b", { online: true, status: { running: false, alert: "卡死", ts: 0 } }),
      dev("c", { online: false }),
    ]);
    expect(summarize(m)).toEqual({ total: 3, online: 2, running: 1, alerts: 1, interactions: 8 });
  });

  it("summarize：离线设备残留的 running/alert 不计入实时统计（防 Hub 重启幽灵计数）", () => {
    const m = applySnapshot([
      dev("a", { online: true, status: { running: true, stats: { likes: 3, follows: 0, comments: 0, videos: 1 }, ts: 0 } }),
      // 重启后从持久化读回：离线却带陈旧 running:true + alert + 历史 stats
      dev("z", { online: false, status: { running: true, alert: "验证码", stats: { likes: 10, follows: 2, comments: 3, videos: 5 }, ts: 0 } }),
    ]);
    // running/alerts 只算在线的 a；interactions 累计（含离线 z 的历史值）。
    expect(summarize(m)).toEqual({ total: 2, online: 1, running: 1, alerts: 0, interactions: 18 });
  });

  it("filterDevices：按名 + 按状态", () => {
    const list = [
      dev("a", { deviceName: "手机A", online: true, status: { running: true, ts: 0 } }),
      dev("b", { deviceName: "手机B", online: false }),
    ];
    expect(filterDevices(list, { q: "A" }).map((d) => d.deviceId)).toEqual(["a"]);
    expect(filterDevices(list, { status: "offline" }).map((d) => d.deviceId)).toEqual(["b"]);
  });

  it("collectAlerts：仅在线告警，按时间倒序", () => {
    const m = applySnapshot([
      dev("a", { online: true, status: { running: true, alert: "旧", ts: 100 } }),
      dev("b", { online: true, status: { running: true, alert: "新", ts: 200 } }),
      dev("c", { online: false, status: { running: false, alert: "离线的", ts: 999 } }),
    ]);
    expect(collectAlerts(m).map((a) => a.alert)).toEqual(["新", "旧"]);
  });

  it("pushSample：保留最近 cap 个", () => {
    let s: ReturnType<typeof pushSample> = [];
    for (let i = 0; i < 5; i++) s = pushSample(s, { t: i, online: 0, running: 0, interactions: 0 }, 3);
    expect(s.map((p) => p.t)).toEqual([2, 3, 4]);
  });
});
