import type { ConfigJobStatus, ConfigProgressMsg } from "@mc/shared";

// 一次批量下发任务的进度（操作员侧），纯函数便于单测。

/** 本地多一个 "pending"：已发起、尚未收到 Hub 任何进度。 */
export type RowStatus = ConfigJobStatus | "pending";

export interface JobRow {
  deviceId: string;
  deviceName: string;
  status: RowStatus;
  error?: string;
}

export interface JobState {
  jobId: string;
  startedAt: number;
  rows: Map<string, JobRow>;
}

/** 终态：不会再变化。 */
const TERMINAL: ReadonlySet<RowStatus> = new Set<RowStatus>(["ok", "failed", "offline", "timeout"]);
export const isTerminal = (s: RowStatus): boolean => TERMINAL.has(s);

export function startJob(
  jobId: string,
  devices: Array<{ deviceId: string; deviceName: string }>,
  now = Date.now(),
): JobState {
  const rows = new Map<string, JobRow>();
  for (const d of devices) {
    rows.set(d.deviceId, { deviceId: d.deviceId, deviceName: d.deviceName, status: "pending" });
  }
  return { jobId, startedAt: now, rows };
}

/** 应用一条来自 Hub 的进度；jobId 不匹配或设备不在本任务则原样返回。 */
export function applyProgress(job: JobState, p: ConfigProgressMsg): JobState;
export function applyProgress(job: JobState | null, p: ConfigProgressMsg): JobState | null;
export function applyProgress(job: JobState | null, p: ConfigProgressMsg): JobState | null {
  if (!job || p.jobId !== job.jobId) return job;
  const row = job.rows.get(p.deviceId);
  if (!row) return job;
  // 终态不被「迟到的」非终态覆盖（如 timeout 后又来 sent）。
  if (isTerminal(row.status) && !isTerminal(p.status)) return job;
  const rows = new Map(job.rows);
  rows.set(p.deviceId, { ...row, status: p.status, error: p.error });
  return { ...job, rows };
}

export interface JobSummary {
  total: number;
  pending: number; // 含 pending + sent（仍在途）
  ok: number;
  failed: number;
  offline: number;
  timeout: number;
  done: boolean; // 所有台都到终态
}

export function summarizeJob(job: JobState | null): JobSummary {
  const s: JobSummary = { total: 0, pending: 0, ok: 0, failed: 0, offline: 0, timeout: 0, done: false };
  if (!job) return s;
  for (const r of job.rows.values()) {
    s.total++;
    if (r.status === "ok") s.ok++;
    else if (r.status === "failed") s.failed++;
    else if (r.status === "offline") s.offline++;
    else if (r.status === "timeout") s.timeout++;
    else s.pending++; // pending / sent
  }
  s.done = s.total > 0 && s.pending === 0;
  return s;
}

/** 仍可重试的设备（失败/超时/离线），用于「重试失败项」。 */
export function retriableDeviceIds(job: JobState | null): string[] {
  if (!job) return [];
  const out: string[] = [];
  for (const r of job.rows.values()) {
    if (r.status === "failed" || r.status === "timeout" || r.status === "offline") out.push(r.deviceId);
  }
  return out;
}

export function jobRows(job: JobState | null): JobRow[] {
  return job ? [...job.rows.values()] : [];
}
