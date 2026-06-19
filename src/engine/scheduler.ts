import type { TaskWindow } from "../params/types";
import { timeToSeconds } from "../params/parse";
import { chance } from "./random";

/** 把 Date 转成当天的秒数（设备本地时间）。 */
function secondsOfDay(d: Date): number {
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

/** 当前时间是否落在任一任务时间段内。 */
export function isWithinAnyWindow(windows: TaskWindow[], now = new Date()): boolean {
  const s = secondsOfDay(now);
  return windows.some((w) => s >= timeToSeconds(w.start) && s < timeToSeconds(w.end));
}

/**
 * 距离下一个时间段开始还有多少秒（用于到点前休眠）。
 * 若今天已无后续时间段，则返回到明天第一段开始的秒数。
 * windows 应已按时间排序。
 */
export function secondsUntilNextWindow(
  windows: TaskWindow[],
  now = new Date(),
): number {
  if (windows.length === 0) return Number.POSITIVE_INFINITY;
  const s = secondsOfDay(now);
  for (const w of windows) {
    const start = timeToSeconds(w.start);
    if (start > s) return start - s;
  }
  // 今天没有了，等到明天第一段。
  const DAY = 24 * 3600;
  return DAY - s + timeToSeconds(windows[0].start);
}

/** 互动模块标识。 */
export type ModuleKind = "forYou" | "kwSearch" | "persHome";

/**
 * 按搜索互动占比 kwSearchExecRatio 抽取本轮要跑的模块（推荐页 or 搜索页）。
 * 个人主页模块每天仅一次，由编排器单独触发，不参与此处抽样。
 */
export function pickModule(kwSearchExecRatio: number): "forYou" | "kwSearch" {
  return chance(kwSearchExecRatio) ? "kwSearch" : "forYou";
}
