// 数据看板取数 + 整形。collector 地址来自设置 collectorUrl。

export interface Summary {
  total: number;
  bySystem: Record<string, number>;
  byEvent: Array<{ name: string; count: number }>;
}
export interface SeriesResp {
  bucketMs: number;
  points: Array<{ t: number; count: number }>;
}

const base = (url: string) => url.replace(/\/$/, "");

export async function fetchSummary(collectorUrl: string, sinceMs = 0): Promise<Summary> {
  const r = await fetch(`${base(collectorUrl)}/v1/stats/summary?since=${sinceMs}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as Summary;
}

export async function fetchSeries(collectorUrl: string, bucketMs: number, sinceMs = 0): Promise<SeriesResp> {
  const r = await fetch(`${base(collectorUrl)}/v1/stats/series?bucket=${bucketMs}&since=${sinceMs}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as SeriesResp;
}

export interface ChartPoint {
  label: string;
  count: number;
}

/** 把时间序列点整形成图表数据：按桶宽决定标签是「时:分」还是「月-日」。纯函数。 */
export function toChart(points: Array<{ t: number; count: number }>, bucketMs: number): ChartPoint[] {
  const byDay = bucketMs >= 86_400_000;
  return points.map((p) => {
    const d = new Date(p.t);
    const pad = (n: number) => String(n).padStart(2, "0");
    const label = byDay ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return { label, count: p.count };
  });
}

/** 系统名 → 中文（看板展示）。 */
export const SYSTEM_LABEL: Record<string, string> = {
  autotk: "手机端",
  "management-center": "管理中心",
  "license-server": "授权服务",
};
export const systemLabel = (s: string): string => SYSTEM_LABEL[s] ?? s;
