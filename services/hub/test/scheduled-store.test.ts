import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PublishTask } from "@mc/shared";
import { ScheduledStore } from "../src/domain/scheduled-store";

const task = (taskId: string, scheduledAtMs?: number): PublishTask => ({
  taskId,
  deviceId: "d",
  videoName: "v.mp4",
  caption: "hi",
  source: { kind: "lan", url: "http://x/f/t" },
  scheduledAtMs,
});

async function tmpFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hub-sch-"));
  return path.join(dir, "scheduled.json");
}

describe("ScheduledStore", () => {
  it("add → list/count；remove 后消失", () => {
    const s = new ScheduledStore();
    s.add(task("t1", 9999));
    s.add(task("t2", 8888));
    expect(s.count()).toBe(2);
    s.remove("t1");
    expect(s.list().map((t) => t.taskId)).toEqual(["t2"]);
  });

  it("持久化：新实例 load 后定时任务还在（Hub 重启不丢）", async () => {
    const file = await tmpFile();
    const s1 = new ScheduledStore(file);
    s1.add(task("t1", 9999));
    await s1.flush();

    const s2 = new ScheduledStore(file);
    await s2.load();
    expect(s2.list()).toHaveLength(1);
    expect(s2.list()[0]).toMatchObject({ taskId: "t1", scheduledAtMs: 9999 });
  });
});
