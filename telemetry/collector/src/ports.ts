import type { StoredEvent } from "./events";
import type { Summary, SeriesPoint } from "./aggregate";

/** 事件存储端口。内存实现用于测试/演示；Postgres 实现用于生产。 */
export interface EventStore {
  insert(rows: StoredEvent[]): Promise<void>;
  /** 总条数（健康/看板用）。 */
  count(): Promise<number>;
  /** 看板汇总：总量 + 按系统 + 按事件名。 */
  summary(sinceMs?: number): Promise<Summary>;
  /** 看板时间序列：按 bucketMs 分桶计数。 */
  series(bucketMs: number, sinceMs: number): Promise<SeriesPoint[]>;
}
