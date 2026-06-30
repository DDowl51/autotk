import type { PublishProgressMsg, PublishStatus } from "@mc/shared";

// 发布任务进度（操作员侧）：按 taskId 索引；deviceName/videoName 在发起时记下，
// Hub 进度只带 taskId/status，按 taskId 更新。纯函数便于单测。

export type RowStatus = PublishStatus | "queued";

export interface PublishRow {
  taskId: string;
  deviceId: string;
  deviceName: string;
  videoName: string;
  fileName: string;
  status: RowStatus;
  error?: string;
  ts: number;
}

export type PublishMap = Map<string, PublishRow>;

export interface NewPublish {
  taskId: string;
  deviceId: string;
  deviceName: string;
  videoName: string;
  fileName: string;
}

export function startPublish(map: PublishMap, n: NewPublish, now = Date.now()): PublishMap {
  const next = new Map(map);
  next.set(n.taskId, { ...n, status: "queued", ts: now });
  return next;
}

export function applyPublishProgress(map: PublishMap, p: PublishProgressMsg): PublishMap {
  const row = map.get(p.taskId);
  if (!row) return map; // 不是本会话发起的任务，忽略
  const next = new Map(map);
  next.set(p.taskId, { ...row, status: p.status, error: p.error });
  return next;
}

const TERMINAL = new Set<RowStatus>(["published", "failed", "offline", "timeout"]);
export const isPublishDone = (s: RowStatus): boolean => TERMINAL.has(s);

/** 最近发起的在前。 */
export function publishRows(map: PublishMap): PublishRow[] {
  return [...map.values()].sort((a, b) => b.ts - a.ts);
}
