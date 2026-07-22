// 分时段调度(L3 §3.1/§1.4/§4 语义 1:1):窗口校验、当天秒数判定、到下一窗秒数。
// 纯函数,时间由调用方注入(设备本地时的「当天秒数」)。

export interface TimeWindow {
  start: string; // "HH:MM:SS"
  end: string;
}

export const DAY_SECONDS = 86400;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

export function timeToSeconds(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

/** 默认时间窗(L3 §4,设备本地时)。 */
export const DEFAULT_WINDOWS: TimeWindow[] = [
  { start: "07:00:00", end: "11:00:00" },
  { start: "12:00:00", end: "16:00:00" },
  { start: "17:00:00", end: "22:00:00" },
  { start: "23:00:00", end: "23:59:00" },
];

/** 校验(L3 §1.4):≥1 段;HH:MM:SS;每段 start<end;按序不重叠(相邻 end==start 允许)。 */
export function validateWindows(ws: TimeWindow[]): void {
  if (!ws || ws.length === 0) throw new Error("taskWindows 至少 1 段");
  let prevEnd = -1;
  for (const w of ws) {
    if (!TIME_RE.test(w.start) || !TIME_RE.test(w.end)) {
      throw new Error(`时间格式须为 HH:MM:SS: ${w.start}–${w.end}`);
    }
    const s = timeToSeconds(w.start);
    const e = timeToSeconds(w.end);
    if (s >= e) throw new Error(`时段 start 须早于 end: ${w.start}–${w.end}`);
    if (s < prevEnd) throw new Error(`时段重叠或未按升序: ${w.start}–${w.end}`);
    prevEnd = e;
  }
}

/** 当前「当天秒数」是否落在任一 [start,end)(左闭右开)。 */
export function isWithinAnyWindow(ws: TimeWindow[], daySec: number): boolean {
  return ws.some((w) => daySec >= timeToSeconds(w.start) && daySec < timeToSeconds(w.end));
}

/** 到下一段 start 的秒数:今天还有→差值;今天没了→到明天首段;空窗→+∞。 */
export function secondsUntilNextWindow(ws: TimeWindow[], daySec: number): number {
  if (!ws || ws.length === 0) return Infinity;
  const starts = ws.map((w) => timeToSeconds(w.start));
  const upcoming = starts.filter((s) => s > daySec);
  if (upcoming.length > 0) return Math.min(...upcoming) - daySec;
  return DAY_SECONDS - daySec + Math.min(...starts);
}
