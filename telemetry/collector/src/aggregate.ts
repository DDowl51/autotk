import type { StoredEvent } from "./events";

// 看板用的纯聚合（给内存 store 用；pg store 用 SQL 实现等价聚合）。

export interface Summary {
  total: number;
  bySystem: Record<string, number>;
  byEvent: Array<{ name: string; count: number }>; // 按次数降序
}

export interface SeriesPoint {
  t: number; // 时间桶起点（ms）
  count: number;
}

export function summarize(rows: StoredEvent[], sinceMs = 0): Summary {
  const bySystem: Record<string, number> = {};
  const byEventMap: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    if (r.receivedAt < sinceMs) continue;
    total++;
    bySystem[r.system] = (bySystem[r.system] ?? 0) + 1;
    byEventMap[r.name] = (byEventMap[r.name] ?? 0) + 1;
  }
  const byEvent = Object.entries(byEventMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  return { total, bySystem, byEvent };
}

export function bucketize(rows: StoredEvent[], bucketMs: number, sinceMs = 0): SeriesPoint[] {
  const buckets = new Map<number, number>();
  for (const r of rows) {
    if (r.receivedAt < sinceMs) continue;
    const b = Math.floor(r.receivedAt / bucketMs) * bucketMs;
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([t, count]) => ({ t, count })).sort((a, b) => a.t - b.t);
}
