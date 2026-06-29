import type { DeviceStatus, DeviceStats, DeviceLogMsg } from "./protocol";

/** 引擎当前状态快照（由 useEngine 采集）。 */
export interface EngineSnapshot {
  running: boolean;
  module?: string;
  page?: string;
  stats?: DeviceStats;
  alert?: string | null;
}

/** 引擎状态 → 上报用 DeviceStatus（纯映射，便于单测）。 */
export function buildStatus(s: EngineSnapshot, now: number = Date.now()): DeviceStatus {
  return {
    running: s.running,
    module: s.module,
    page: s.page,
    stats: s.stats,
    alert: s.alert ?? null,
    ts: now,
  };
}

interface Entry {
  level: DeviceLogMsg["level"];
  msg: string;
  ts: number;
  count: number;
}

/**
 * 日志缓冲：合并相邻重复（"×N"）、flush 时超上限丢最旧并标记。
 * 上层定时 flush() 取一批上报；几百台时配合"看时快/不看时慢"的频率控制带宽。
 */
export class LogBuffer {
  private entries: Entry[] = [];
  constructor(private readonly cap = 80) {}

  push(line: DeviceLogMsg): void {
    const last = this.entries[this.entries.length - 1];
    if (last && last.level === line.level && last.msg === line.msg) {
      last.count++;
      last.ts = line.ts;
    } else {
      this.entries.push({ level: line.level, msg: line.msg, ts: line.ts, count: 1 });
    }
  }

  get size(): number {
    return this.entries.length;
  }

  /** 取出并清空当前缓冲；超上限丢最旧 + 加"…省略 N 条"。 */
  flush(now: number = Date.now()): DeviceLogMsg[] {
    let es = this.entries;
    this.entries = [];
    let dropped = 0;
    if (es.length > this.cap) {
      dropped = es.length - this.cap;
      es = es.slice(es.length - this.cap);
    }
    const out: DeviceLogMsg[] = es.map((e) => ({
      level: e.level,
      msg: e.count > 1 ? `${e.msg} ×${e.count}` : e.msg,
      ts: e.ts,
    }));
    if (dropped > 0) out.unshift({ level: "info", msg: `…省略 ${dropped} 条`, ts: now });
    return out;
  }
}
