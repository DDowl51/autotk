import { describe, expect, it } from "vitest";
import {
  DEFAULT_WINDOWS,
  isWithinAnyWindow,
  secondsUntilNextWindow,
  timeToSeconds,
  validateWindows,
} from "../src/schedule";

const W = [
  { start: "07:00:00", end: "11:00:00" },
  { start: "12:00:00", end: "16:00:00" },
];
const h = (n: number): number => n * 3600;

describe("timeToSeconds / 校验", () => {
  it("HH:MM:SS → 当天秒数", () => {
    expect(timeToSeconds("07:00:00")).toBe(25200);
    expect(timeToSeconds("23:59:59")).toBe(86399);
  });

  it("默认 4 窗合法", () => {
    expect(() => validateWindows(DEFAULT_WINDOWS)).not.toThrow();
  });

  it("空/格式错/start≥end/重叠 → 报错", () => {
    expect(() => validateWindows([])).toThrow(/至少 1 段/);
    expect(() => validateWindows([{ start: "7:00:00", end: "11:00:00" }])).toThrow(/HH:MM:SS/);
    expect(() => validateWindows([{ start: "25:00:00", end: "26:00:00" }])).toThrow(/HH:MM:SS/);
    expect(() => validateWindows([{ start: "11:00:00", end: "11:00:00" }])).toThrow(/早于/);
    expect(() => validateWindows([W[0], { start: "10:00:00", end: "12:00:00" }])).toThrow(/重叠/);
    // 相邻 end==start 允许(不重叠)
    expect(() => validateWindows([W[0], { start: "11:00:00", end: "12:00:00" }])).not.toThrow();
  });
});

describe("isWithinAnyWindow(左闭右开)", () => {
  it("start 含、end 不含", () => {
    expect(isWithinAnyWindow(W, h(7))).toBe(true);
    expect(isWithinAnyWindow(W, h(11) - 1)).toBe(true);
    expect(isWithinAnyWindow(W, h(11))).toBe(false);
    expect(isWithinAnyWindow(W, h(6))).toBe(false);
    expect(isWithinAnyWindow(W, h(13))).toBe(true);
  });
});

describe("secondsUntilNextWindow", () => {
  it("今天还有下一段 → 差值", () => {
    expect(secondsUntilNextWindow(W, h(6))).toBe(h(1)); // 06:00 → 07:00
    expect(secondsUntilNextWindow(W, h(11))).toBe(h(1)); // 11:00 → 12:00
  });
  it("今天没了 → 到明天首段", () => {
    expect(secondsUntilNextWindow(W, h(20))).toBe(86400 - h(20) + h(7));
  });
  it("空窗 → +∞", () => {
    expect(secondsUntilNextWindow([], h(6))).toBe(Infinity);
  });
});
