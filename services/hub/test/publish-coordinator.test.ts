import { describe, it, expect } from "vitest";
import { PublishCoordinator } from "../src/domain/publish-coordinator";
import type { Timers } from "../src/domain/config-dispatcher";
import type { PublishProgressMsg, PublishTask } from "@mc/shared";

const task = (taskId: string, deviceId = "d"): PublishTask => ({
  taskId,
  deviceId,
  videoName: "v.mp4",
  caption: "hi",
  source: { kind: "lan", url: "http://x/f/t" },
});

function fakeTimers() {
  const fns: Array<() => void> = [];
  const timers: Timers = {
    set(fn) {
      fns.push(fn);
      return () => {
        const i = fns.indexOf(fn);
        if (i >= 0) fns.splice(i, 1);
      };
    },
  };
  return { timers, fireAll: () => [...fns].forEach((f) => f()), count: () => fns.length };
}

function mk(online: Set<string>, timers?: Timers) {
  const progress: PublishProgressMsg[] = [];
  const sent: string[] = [];
  const c = new PublishCoordinator(
    (deviceId, t) => {
      if (!online.has(deviceId)) return false;
      sent.push(t.taskId);
      return true;
    },
    (p) => progress.push(p),
    { timeoutMs: 1000, timers },
  );
  return { c, progress, sent };
}
const statuses = (p: PublishProgressMsg[], taskId: string) => p.filter((x) => x.taskId === taskId).map((x) => x.status);

describe("PublishCoordinator", () => {
  it("在线：sent → downloading → published（终态清理）", () => {
    const { c, progress, sent } = mk(new Set(["d"]));
    c.start(task("t1"));
    expect(sent).toEqual(["t1"]);
    c.onResult("t1", "downloading");
    c.onResult("t1", "published");
    expect(statuses(progress, "t1")).toEqual(["sent", "downloading", "published"]);
    expect(c.pendingCount()).toBe(0);
  });

  it("离线：直接 offline，不下发", () => {
    const { c, progress, sent } = mk(new Set());
    c.start(task("t1", "ghost"));
    expect(sent).toEqual([]);
    expect(statuses(progress, "t1")).toEqual(["offline"]);
    expect(c.pendingCount()).toBe(0);
  });

  it("失败终态带错误", () => {
    const { c, progress } = mk(new Set(["d"]));
    c.start(task("t1"));
    c.onResult("t1", "failed", "相册写入失败");
    expect(progress.find((p) => p.status === "failed")?.error).toBe("相册写入失败");
    expect(c.pendingCount()).toBe(0);
  });

  it("无进展超时；中间进展会重置超时", () => {
    const ft = fakeTimers();
    const { c, progress } = mk(new Set(["d"]), ft.timers);
    c.start(task("t1"));
    expect(ft.count()).toBe(1);
    c.onResult("t1", "downloading"); // 取消旧计时、装新计时
    expect(ft.count()).toBe(1);
    ft.fireAll(); // 模拟之后仍卡住
    expect(statuses(progress, "t1")).toEqual(["sent", "downloading", "timeout"]);
    expect(c.pendingCount()).toBe(0);
  });

  it("终态后定时器不再触发", () => {
    const ft = fakeTimers();
    const { c, progress } = mk(new Set(["d"]), ft.timers);
    c.start(task("t1"));
    c.onResult("t1", "published");
    ft.fireAll();
    expect(statuses(progress, "t1")).toEqual(["sent", "published"]);
  });

  it("未知 taskId 忽略", () => {
    const { c, progress } = mk(new Set(["d"]));
    c.start(task("t1"));
    const before = progress.length;
    c.onResult("nope", "published");
    expect(progress.length).toBe(before);
  });
});
