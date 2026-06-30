import type { EventStore } from "../ports";
import type { StoredEvent } from "../events";
import { summarize, bucketize, type Summary, type SeriesPoint } from "../aggregate";

/** 内存事件存储（测试/无 DB 演示）。 */
export class MemoryEventStore implements EventStore {
  readonly rows: StoredEvent[] = [];
  async insert(rows: StoredEvent[]): Promise<void> {
    this.rows.push(...rows);
  }
  async count(): Promise<number> {
    return this.rows.length;
  }
  async summary(sinceMs = 0): Promise<Summary> {
    return summarize(this.rows, sinceMs);
  }
  async series(bucketMs: number, sinceMs: number): Promise<SeriesPoint[]> {
    return bucketize(this.rows, bucketMs, sinceMs);
  }
}
