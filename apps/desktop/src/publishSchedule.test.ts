import { describe, it, expect } from "vitest";
import dayjs from "dayjs";
import { spreadTimesFor, initTimes } from "./publishSchedule";
import type { DevicePlan, PublishPlanItem } from "./publish-ipc";

const mk = (absPath: string): PublishPlanItem => ({
  deviceName: "d1",
  fileName: absPath,
  absPath,
  size: 0,
  mtimeMs: 0,
  caption: "",
  scheduledAt: 0,
});

describe("spreadTimesFor", () => {
  it("每条各一个时间，全部在将来且升序", () => {
    const now = dayjs("2026-07-01T10:00:00").valueOf();
    const out = spreadTimesFor([mk("a"), mk("b"), mk("c")], now);
    const ts = ["a", "b", "c"].map((k) => out[k].valueOf());
    expect(Object.keys(out)).toHaveLength(3);
    for (const t of ts) expect(t).toBeGreaterThan(now);
    expect(ts[0]).toBeLessThan(ts[1]);
    expect(ts[1]).toBeLessThan(ts[2]);
  });

  it("临近午夜（窗口极短）也保证严格将来且至少间隔 30s", () => {
    const now = dayjs("2026-07-01T23:59:30").valueOf();
    const out = spreadTimesFor([mk("a"), mk("b"), mk("c")], now);
    const ts = ["a", "b", "c"].map((k) => out[k].valueOf());
    expect(ts[0]).toBeGreaterThanOrEqual(now + 30_000);
    expect(ts[1]).toBeGreaterThanOrEqual(ts[0] + 29_000);
    expect(ts[2]).toBeGreaterThanOrEqual(ts[1] + 29_000);
  });

  it("空列表 → 空结果", () => {
    expect(Object.keys(spreadTimesFor([]))).toHaveLength(0);
  });
});

describe("initTimes", () => {
  it("新视频给错峰建议；已改过的（含清空为立即）沿用旧值", () => {
    const plans: DevicePlan[] = [{ deviceName: "d1", pending: [mk("a"), mk("b")], publishedCount: 0 }];
    const manual = dayjs("2026-07-01T20:00:00");
    const prev = { a: null, b: manual }; // a 被清空为立即；b 手动设过
    const out = initTimes(plans, prev);
    expect(out.a).toBeNull(); // 立即，沿用
    expect(out.b?.valueOf()).toBe(manual.valueOf()); // 手动值，沿用
  });

  it("prev 里没有的视频拿到一个建议时间；已不在 pending 的键不保留", () => {
    const plans: DevicePlan[] = [{ deviceName: "d1", pending: [mk("new")], publishedCount: 0 }];
    const out = initTimes(plans, { gone: dayjs() });
    expect(out.new).not.toBeNull();
    expect("gone" in out).toBe(false);
  });
});
