// 排程（纯函数）：把当天的待发视频均摊到「活跃时段」里，并加随机抖动，避免整点齐发像机器。

/** 活跃时段（当天，单位：自午夜起的秒）。 */
export interface Window {
  startSec: number;
  endSec: number;
}

const SECONDS_PER_DAY = 86400;

/** "HH:MM:SS" → 自午夜的秒数。 */
export function hmsToSec(hms: string): number {
  const [h, m, s] = hms.split(":").map((x) => parseInt(x, 10) || 0);
  return h * 3600 + m * 60 + s;
}

/** allDay=true → 全天一个窗口；否则用给定时间段（已校验合法）。 */
export function toWindows(allDay: boolean, taskWindows: Array<{ start: string; end: string }>): Window[] {
  if (allDay) return [{ startSec: 0, endSec: SECONDS_PER_DAY }];
  return taskWindows
    .map((w) => ({ startSec: hmsToSec(w.start), endSec: hmsToSec(w.end) }))
    .filter((w) => w.endSec > w.startSec)
    .sort((a, b) => a.startSec - b.startSec);
}

export function windowsTotalSec(windows: Window[]): number {
  return windows.reduce((sum, w) => sum + (w.endSec - w.startSec), 0);
}

export interface SpreadOpts {
  jitterSec?: number; // 每个点的最大抖动（±），默认 0
  rng?: () => number; // [0,1)，可注入以便测试
}

/**
 * 把 count 个点均匀铺在所有窗口拼接成的总时长上（每点取所在小段中心），再加 ±jitter（夹在窗口内）。
 * 返回「自午夜的秒」升序数组。count<=0 或无窗口 → []。
 */
export function spread(count: number, windows: Window[], opts: SpreadOpts = {}): number[] {
  const total = windowsTotalSec(windows);
  if (count <= 0 || total <= 0) return [];
  const jitter = opts.jitterSec ?? 0;
  const rng = opts.rng ?? Math.random;

  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    // 在 [0,total) 上取第 i 段的中心，映射回真实窗口。
    const offset = (total * (i + 0.5)) / count;
    let acc = 0;
    let sec = windows[windows.length - 1].endSec;
    let win = windows[windows.length - 1];
    for (const w of windows) {
      const dur = w.endSec - w.startSec;
      if (offset < acc + dur) {
        sec = w.startSec + (offset - acc);
        win = w;
        break;
      }
      acc += dur;
    }
    if (jitter > 0) {
      sec += (rng() * 2 - 1) * jitter;
      sec = Math.min(win.endSec - 1, Math.max(win.startSec, sec));
    }
    out.push(Math.round(sec));
  }
  return out.sort((a, b) => a - b);
}

/** 把「自午夜秒」数组换成当天的绝对时间戳（ms）。 */
export function secsToTimestamps(secs: number[], dayStartMs: number): number[] {
  return secs.map((s) => dayStartMs + s * 1000);
}

/** 今天 0 点的时间戳（ms）。 */
export function startOfDayMs(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
