import type { DeviceLogMsg } from "@mc/shared";

// 每台设备的日志缓冲（操作员侧），按 deviceId 索引；纯函数便于单测。
export type LogMap = Map<string, DeviceLogMsg[]>;

export const LOG_CAP = 500;

/**
 * 收到 Hub 的 device:logs 推送后更新缓冲：
 * - replace=true（开始查看时的全量快照）→ 整段替换；
 * - 否则追加增量；超 cap 丢最旧。
 */
export function applyLogs(
  map: LogMap,
  deviceId: string,
  lines: DeviceLogMsg[],
  replace = false,
  cap = LOG_CAP,
): LogMap {
  const next = new Map(map);
  const prev = replace ? [] : (next.get(deviceId) ?? []);
  const merged = prev.concat(lines);
  next.set(deviceId, merged.length > cap ? merged.slice(merged.length - cap) : merged);
  return next;
}

/** 关闭查看时清掉该台缓冲，省内存（下次打开会重新拉全量快照）。 */
export function clearLogs(map: LogMap, deviceId: string): LogMap {
  if (!map.has(deviceId)) return map;
  const next = new Map(map);
  next.delete(deviceId);
  return next;
}

export function getLogs(map: LogMap, deviceId: string): DeviceLogMsg[] {
  return map.get(deviceId) ?? [];
}
