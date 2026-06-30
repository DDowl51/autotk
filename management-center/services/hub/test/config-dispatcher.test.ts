import { describe, it, expect } from "vitest";
import { ConfigDispatcher, type Timers } from "../src/domain/config-dispatcher";
import type { ConfigProgressMsg } from "@mc/shared";

const patch = { clickWaitTime: 1 };

/** 假定时器：手动触发 fire() 以模拟超时。 */
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
  return { timers, fireAll: () => [...fns].forEach((f) => f()) };
}

function mk(online: Set<string>, opts?: { timers?: Timers }) {
  const progress: ConfigProgressMsg[] = [];
  const sent: string[] = [];
  const d = new ConfigDispatcher(
    (deviceId) => {
      if (!online.has(deviceId)) return false;
      sent.push(deviceId);
      return true;
    },
    (p) => progress.push(p),
    { timeoutMs: 1000, timers: opts?.timers },
  );
  return { d, progress, sent };
}

const statusOf = (progress: ConfigProgressMsg[], deviceId: string) =>
  progress.filter((p) => p.deviceId === deviceId).map((p) => p.status);

describe("ConfigDispatcher", () => {
  it("在线设备：sent → 回 ok", () => {
    const { d, progress, sent } = mk(new Set(["a"]));
    d.start("j1", ["a"], patch);
    expect(sent).toEqual(["a"]);
    expect(statusOf(progress, "a")).toEqual(["sent"]);
    d.onResult("j1", "a", true);
    expect(statusOf(progress, "a")).toEqual(["sent", "ok"]);
    expect(d.pendingCount("j1")).toBe(0);
  });

  it("离线设备：直接 offline，不下发不等待", () => {
    const { d, progress, sent } = mk(new Set());
    d.start("j1", ["x"], patch);
    expect(sent).toEqual([]);
    expect(statusOf(progress, "x")).toEqual(["offline"]);
    expect(d.pendingCount("j1")).toBe(0);
  });

  it("部分在线部分离线", () => {
    const { d, progress } = mk(new Set(["a"]));
    d.start("j1", ["a", "b"], patch);
    expect(statusOf(progress, "a")).toEqual(["sent"]);
    expect(statusOf(progress, "b")).toEqual(["offline"]);
  });

  it("应用失败：回 failed 带错误", () => {
    const { d, progress } = mk(new Set(["a"]));
    d.start("j1", ["a"], patch);
    d.onResult("j1", "a", false, "搜索互动占比 必须在 0~1 之间");
    const last = progress.find((p) => p.deviceId === "a" && p.status === "failed");
    expect(last?.error).toMatch(/0~1/);
  });

  it("超时：到点没回 → timeout", () => {
    const ft = fakeTimers();
    const { d, progress } = mk(new Set(["a"]), { timers: ft.timers });
    d.start("j1", ["a"], patch);
    expect(d.pendingCount("j1")).toBe(1);
    ft.fireAll(); // 模拟 30s 到点
    expect(statusOf(progress, "a")).toEqual(["sent", "timeout"]);
    expect(d.pendingCount("j1")).toBe(0);
  });

  it("回执后超时不再触发（定时器已取消）", () => {
    const ft = fakeTimers();
    const { d, progress } = mk(new Set(["a"]), { timers: ft.timers });
    d.start("j1", ["a"], patch);
    d.onResult("j1", "a", true);
    ft.fireAll(); // 应无效果
    expect(statusOf(progress, "a")).toEqual(["sent", "ok"]);
  });

  it("未知/重复回执被忽略", () => {
    const { d, progress } = mk(new Set(["a"]));
    d.start("j1", ["a"], patch);
    d.onResult("j1", "a", true);
    const before = progress.length;
    d.onResult("j1", "a", true); // 重复
    d.onResult("nojob", "a", true); // 未知 job
    expect(progress.length).toBe(before);
  });

  it("deviceIds 去重", () => {
    const { d, sent } = mk(new Set(["a"]));
    d.start("j1", ["a", "a"], patch);
    expect(sent).toEqual(["a"]);
  });
});
