import { describe, expect, it, vi } from "vitest";
import type { Driver, ImageBytes, Size } from "@auto/core";
import { loggingDriver, swipeDir } from "../src/loggingDriver";

const SIZE: Size = { width: 375, height: 667 };
function fakeInner(): { driver: Driver; taps: number; swipes: number } {
  const spy = { taps: 0, swipes: 0 };
  return {
    get taps() {
      return spy.taps;
    },
    get swipes() {
      return spy.swipes;
    },
    driver: {
      screenshot: async (): Promise<ImageBytes> => new Uint8Array(0),
      tap: async () => {
        spy.taps++;
      },
      swipe: async () => {
        spy.swipes++;
      },
      typeText: async () => {},
      activateApp: async () => {},
      ensureHealthy: async () => {},
      windowSize: async () => SIZE,
    },
  };
}

describe("swipeDir", () => {
  it("竖向优先:上滑/下滑;横向:左/右", () => {
    expect(swipeDir({ x: 100, y: 400 }, { x: 100, y: 100 })).toContain("上滑"); // y 变小=上
    expect(swipeDir({ x: 100, y: 100 }, { x: 100, y: 400 })).toContain("下滑");
    expect(swipeDir({ x: 300, y: 100 }, { x: 50, y: 100 })).toContain("左滑");
    expect(swipeDir({ x: 50, y: 100 }, { x: 300, y: 100 })).toContain("右滑");
  });
});

describe("loggingDriver", () => {
  it("每个操作打印日志且透传给内层", async () => {
    const inner = fakeInner();
    const logs: string[] = [];
    const d = loggingDriver(inner.driver, (m) => logs.push(m));
    await d.tap({ x: 120, y: 300 });
    await d.swipe({ x: 187, y: 440 }, { x: 187, y: 170 }, 250);
    await d.typeText("你好");
    await d.activateApp("com.zhiliaoapp.musically");
    expect(inner.taps).toBe(1);
    expect(inner.swipes).toBe(1);
    expect(logs[0]).toContain("点 (120,300)");
    expect(logs[1]).toMatch(/滑.*上滑.*\(187,440\)→\(187,170\)/);
    expect(logs[2]).toContain('输入 "你好"');
    expect(logs[3]).toContain("切前台");
  });

  it("screenshot 不打印(太频繁)", async () => {
    const inner = fakeInner();
    const logs: string[] = [];
    const d = loggingDriver(inner.driver, (m) => logs.push(m));
    await d.screenshot();
    await d.windowSize();
    expect(logs).toEqual([]);
  });
});
