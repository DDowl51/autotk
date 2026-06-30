// 用量统计的纯聚合逻辑（不依赖 DB，可单测）。

export interface DayCount {
  date: string; // YYYY-MM-DD（UTC）
  count: number;
}

const DAY_MS = 86_400_000;
const dayKey = (ms: number): string => new Date(Math.floor(ms / DAY_MS) * DAY_MS).toISOString().slice(0, 10);

/**
 * 把一组时间戳按日分桶，输出最近 days 天（含今天）每天的计数。
 * 缺失的日期补 0；范围外的时间戳忽略。结果按日期升序。
 */
export function bucketByDay(timestamps: number[], days: number, now: number = Date.now()): DayCount[] {
  const n = Math.max(1, Math.floor(days));
  const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
  const counts = new Map<string, number>();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = dayKey(todayStart - i * DAY_MS);
    keys.push(key);
    counts.set(key, 0);
  }
  for (const t of timestamps) {
    const key = dayKey(t);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return keys.map((date) => ({ date, count: counts.get(date) ?? 0 }));
}

export interface StatusCount {
  status: string;
  count: number;
}

/** 激活码状态分布（固定顺序 UNUSED/ACTIVE/DISABLED，缺的补 0）。 */
export function statusBreakdown(statuses: string[]): StatusCount[] {
  const order = ["UNUSED", "ACTIVE", "DISABLED"];
  const m = new Map<string, number>();
  for (const s of statuses) m.set(s, (m.get(s) ?? 0) + 1);
  return order.map((status) => ({ status, count: m.get(status) ?? 0 }));
}
