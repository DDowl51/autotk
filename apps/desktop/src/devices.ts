import type { DeviceInfo } from "@mc/shared";

// 设备列表状态：按 deviceId 索引；纯函数便于单测（渲染层只管展示）。

export type DeviceMap = Map<string, DeviceInfo>;

export function applySnapshot(list: DeviceInfo[]): DeviceMap {
  return new Map(list.map((d) => [d.deviceId, d]));
}

export function applyUpdate(map: DeviceMap, d: DeviceInfo): DeviceMap {
  const next = new Map(map);
  next.set(d.deviceId, d);
  return next;
}

/** 在线优先、其次按设备名排序，供表格展示。 */
export function toSorted(map: DeviceMap): DeviceInfo[] {
  return [...map.values()].sort(
    (a, b) => Number(b.online) - Number(a.online) || a.deviceName.localeCompare(b.deviceName),
  );
}

export type StatusKind = "alert" | "stalled" | "running" | "online" | "offline";

export interface StatusOpts {
  now?: number;
  /** 「疑似卡住」阈值（毫秒）；不传则不判 stalled。 */
  stalledMs?: number;
}

/** 设备展示状态（优先级：告警 > 疑似卡住 > 运行中 > 在线 > 离线）。 */
export function statusKind(d: DeviceInfo, opts: StatusOpts = {}): StatusKind {
  if (!d.online) return "offline";
  if (d.status?.alert) return "alert";
  if (d.status?.running) {
    const now = opts.now ?? Date.now();
    if (opts.stalledMs && d.lastProgressAt && now - d.lastProgressAt > opts.stalledMs) {
      return "stalled";
    }
    return "running";
  }
  return "online";
}

export const STATUS_LABEL: Record<StatusKind, string> = {
  alert: "告警",
  stalled: "疑似卡住",
  running: "运行中",
  online: "在线",
  offline: "离线",
};

/** 电量色调：<20% 危险、<50% 偏低、否则正常。纯函数，便于单测。 */
export type BatteryTone = "danger" | "warn" | "ok";
export function batteryTone(level: number): BatteryTone {
  if (level < 20) return "danger";
  if (level < 50) return "warn";
  return "ok";
}

export interface Summary {
  total: number;
  online: number;
  running: number;
  alerts: number;
  interactions: number; // 全机群累计互动数（赞+关注+评论）
}

export function summarize(map: DeviceMap): Summary {
  let online = 0;
  let running = 0;
  let alerts = 0;
  let interactions = 0;
  for (const d of map.values()) {
    if (d.online) online++;
    // running/alert 是「实时态」，只统计在线设备：Hub 重启后从持久化读回的离线设备会残留
    // 陈旧的 running:true/alert，若不按 online 过滤会让顶栏「运行中/告警」虚高
    // （与 statusKind:34 先判 !online、collectAlerts:111 要求 d.online 保持一致）。
    if (d.online && d.status?.running) running++;
    if (d.online && d.status?.alert) alerts++;
    const s = d.status?.stats;
    if (s) interactions += s.likes + s.follows + s.comments; // 互动是累计量，离线设备的历史值仍计入
  }
  return { total: map.size, online, running, alerts, interactions };
}

export interface DeviceFilter {
  q?: string;
  status?: StatusKind;
}

/** 按名搜索 + 按状态筛选（纯函数，便于单测）。 */
export function filterDevices(list: DeviceInfo[], f: DeviceFilter, opts?: StatusOpts): DeviceInfo[] {
  const q = f.q?.trim().toLowerCase();
  return list.filter((d) => {
    if (q && !d.deviceName.toLowerCase().includes(q)) return false;
    if (f.status && statusKind(d, opts) !== f.status) return false;
    return true;
  });
}

export interface AlertItem {
  deviceId: string;
  deviceName: string;
  alert: string;
  ts: number;
}

/** 收集当前所有在线设备的告警，按时间倒序。 */
export function collectAlerts(map: DeviceMap): AlertItem[] {
  const out: AlertItem[] = [];
  for (const d of map.values()) {
    if (d.online && d.status?.alert) {
      out.push({ deviceId: d.deviceId, deviceName: d.deviceName, alert: d.status.alert, ts: d.status.ts });
    }
  }
  return out.sort((a, b) => b.ts - a.ts);
}

export interface SamplePoint {
  t: number;
  online: number;
  running: number;
  interactions: number;
}

/** 往时间序列追加一个采样点，保留最近 cap 个。 */
export function pushSample(series: SamplePoint[], point: SamplePoint, cap: number): SamplePoint[] {
  const next = [...series, point];
  return next.length > cap ? next.slice(next.length - cap) : next;
}
