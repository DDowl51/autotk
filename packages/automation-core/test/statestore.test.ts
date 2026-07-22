import { describe, expect, it } from "vitest";
import { createMemoryStateStore, defaultTodayKey } from "../src/statestore";

describe("内存 StateStore", () => {
  it("has/add:按命名空间隔离", async () => {
    const s = createMemoryStateStore();
    expect(await s.has("dm:acc1", "alice")).toBe(false);
    await s.add("dm:acc1", "alice");
    expect(await s.has("dm:acc1", "alice")).toBe(true);
    expect(await s.has("dm:acc2", "alice")).toBe(false);
  });

  it("incrDaily/peekDaily:按「ns+key+当天」计数,peek 不自增", async () => {
    let day = "2026-7-10";
    const s = createMemoryStateStore(() => day);
    expect(await s.peekDaily("dm-count", "acc1")).toBe(0);
    expect(await s.incrDaily("dm-count", "acc1")).toBe(1);
    expect(await s.incrDaily("dm-count", "acc1")).toBe(2);
    expect(await s.peekDaily("dm-count", "acc1")).toBe(2);
    expect(await s.peekDaily("dm-count", "acc2")).toBe(0);
    // 跨天清零(新的一天新配额)
    day = "2026-7-11";
    expect(await s.peekDaily("dm-count", "acc1")).toBe(0);
    expect(await s.incrDaily("dm-count", "acc1")).toBe(1);
  });

  it("defaultTodayKey 是 YYYY-M-D(不补零,对齐 L3 §3.4)", () => {
    expect(defaultTodayKey(new Date(2026, 6, 10))).toBe("2026-7-10");
    expect(defaultTodayKey(new Date(2026, 0, 5))).toBe("2026-1-5");
  });
});
