import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PendingStore } from "../src/domain/pending-store";

async function tmpFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hub-ps-"));
  return path.join(dir, "pending.json");
}

describe("PendingStore", () => {
  it("入队 → take 按序取出并清空；重复 take 为空", async () => {
    const s = new PendingStore();
    await s.enqueueConfig("d1", "j1", { clickWaitTime: 2 });
    await s.enqueuePublish("d1", {
      taskId: "t1",
      videoName: "v.mp4",
      caption: "c",
      source: { kind: "lan", url: "http://op/f/x" },
    });
    expect(s.count("d1")).toBe(2);

    const items = await s.take("d1");
    expect(items.map((i) => i.kind)).toEqual(["config", "publish"]);
    expect(s.count("d1")).toBe(0);
    expect((await s.take("d1")).length).toBe(0);
  });

  it("持久化：新实例 load 后积压还在（Hub 重启不丢）", async () => {
    const file = await tmpFile();
    const s1 = new PendingStore(file);
    await s1.enqueueConfig("d1", "j1", { clickWaitTime: 3 });

    const s2 = new PendingStore(file);
    await s2.load();
    const items = await s2.take("d1");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "config", jobId: "j1", patch: { clickWaitTime: 3 } });
  });

  it("单台积压超上限 → 丢最旧", async () => {
    const s = new PendingStore();
    for (let i = 0; i < 60; i++) await s.enqueueConfig("d1", `j${i}`, {});
    expect(s.count("d1")).toBe(50);
    const items = await s.take("d1");
    expect(items[0].kind === "config" && items[0].jobId).toBe("j10"); // j0..j9 被丢
  });
});
