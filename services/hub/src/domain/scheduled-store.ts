import { promises as fs } from "node:fs";
import path from "node:path";
import type { PublishTask } from "@mc/shared";

/**
 * 定时发布（scheduledAtMs 在未来、尚未到点下发）的持久化存储：按 taskId 存整条 PublishTask、落 JSON。
 * PublishCoordinator 排程时 add、到点下发时 remove；Hub 启动时把 list() 出来的重新排程 →
 * 定时发布不因 Hub（内嵌桌面 App）重启而丢。不传 file 则纯内存（测试）。
 * 写经同一条 Promise 链串行化，避免并发写坏文件。
 */
export class ScheduledStore {
  private readonly m = new Map<string, PublishTask>();
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly file?: string) {}

  async load(): Promise<void> {
    if (!this.file) return;
    try {
      const raw = await fs.readFile(this.file, "utf8");
      const arr = JSON.parse(raw) as PublishTask[];
      if (Array.isArray(arr)) {
        for (const t of arr) if (t && typeof t.taskId === "string") this.m.set(t.taskId, t);
      }
    } catch {
      /* 没有/损坏就空 */
    }
  }

  /** 记下一条未来定时任务（同 taskId 覆盖）。 */
  add(task: PublishTask): void {
    this.m.set(task.taskId, task);
    void this.persist();
  }

  /** 到点下发/取消后移除。 */
  remove(taskId: string): void {
    if (this.m.delete(taskId)) void this.persist();
  }

  list(): PublishTask[] {
    return [...this.m.values()];
  }

  count(): number {
    return this.m.size;
  }

  /** 等最近一次写落盘（测试用）。 */
  flush(): Promise<void> {
    return this.chain;
  }

  private persist(): Promise<void> {
    if (!this.file) return Promise.resolve();
    const file = this.file;
    this.chain = this.chain.then(async () => {
      try {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify([...this.m.values()], null, 2), "utf8");
      } catch {
        /* 写失败忽略 */
      }
    });
    return this.chain;
  }
}
