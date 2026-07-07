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
  let sets = 0; // 累计 set 次数（含重排）；用于断言「某任务被重新装了计时」
  const timers: Timers = {
    set(fn) {
      sets++;
      fns.push(fn);
      return () => {
        const i = fns.indexOf(fn);
        if (i >= 0) fns.splice(i, 1);
      };
    },
  };
  return { timers, fireAll: () => [...fns].forEach((f) => f()), count: () => fns.length, sets: () => sets };
}

function mk(online: Set<string>, timers?: Timers, now?: () => number) {
  const progress: PublishProgressMsg[] = [];
  const sent: string[] = [];
  const c = new PublishCoordinator(
    (deviceId, t) => {
      if (!online.has(deviceId)) return false;
      sent.push(t.taskId);
      return true;
    },
    (p) => progress.push(p),
    { timeoutMs: 1000, timers, now },
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

  it("发布成功触发 onPublished(deviceId, videoName)；中间态/失败不触发（服务端权威去重）", () => {
    const published: Array<[string, string]> = [];
    const c = new PublishCoordinator(() => true, () => {}, {
      onPublished: (deviceId, videoName) => published.push([deviceId, videoName]),
    });
    c.start(task("t1", "d")); // videoName = "v.mp4"
    c.onResult("t1", "downloading"); // 中间态不触发
    expect(published).toEqual([]);
    c.onResult("t1", "published"); // 终态 published → 触发
    expect(published).toEqual([["d", "v.mp4"]]);

    c.start(task("t2", "d"));
    c.onResult("t2", "failed", "x"); // 失败终态不触发
    expect(published).toEqual([["d", "v.mp4"]]);
  });

  it("批量同设备：任一任务有进展会重排同设备其余在途任务的超时（防误判 timeout）", () => {
    const ft = fakeTimers();
    const { c } = mk(new Set(["d"]), ft.timers);
    c.start(task("t1", "d"));
    c.start(task("t2", "d")); // 排 t1 后面，等待中
    expect(ft.sets()).toBe(2); // 两条各装一个无进展计时
    c.onResult("t1", "downloading"); // 设备活着：t1 重排(3) + t2 也被重排(4)
    expect(ft.sets()).toBe(4); // 关键：t2 被重排（否则只有 3），等待期不会到点 timeout
    expect(ft.count()).toBe(2); // 仍是两条在途
  });

  it("跨设备不误伤：A 设备任务进展不重排 B 设备任务", () => {
    const ft = fakeTimers();
    const { c } = mk(new Set(["a", "b"]), ft.timers);
    c.start(task("t1", "a"));
    c.start(task("t2", "b"));
    expect(ft.sets()).toBe(2);
    c.onResult("t1", "downloading"); // 仅 t1(a) 重排(3)；t2(b) 不动
    expect(ft.sets()).toBe(3); // 不是 4
  });

  it("批量同设备：t1 收尾后 t2 仍在队列、能正常走到终态", () => {
    const { c, progress } = mk(new Set(["d"]));
    c.start(task("t1", "d"));
    c.start(task("t2", "d"));
    expect(c.pendingCount()).toBe(2);
    c.onResult("t1", "downloading");
    c.onResult("t1", "published"); // t1 收尾，t2 仍在
    expect(c.pendingCount()).toBe(1);
    c.onResult("t2", "downloading");
    c.onResult("t2", "published");
    expect(c.pendingCount()).toBe(0);
    expect(statuses(progress, "t2")).toEqual(["sent", "downloading", "published"]);
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

  it("定时·未来时刻：先 scheduled、不下发；到点触发才 sent", () => {
    const ft = fakeTimers();
    const { c, progress, sent } = mk(new Set(["d"]), ft.timers, () => 1000);
    c.start({ ...task("t1"), scheduledAtMs: 5000 });
    expect(sent).toEqual([]);
    expect(statuses(progress, "t1")).toEqual(["scheduled"]);
    expect(c.pendingCount()).toBe(1);
    ft.fireAll(); // 到点
    expect(sent).toEqual(["t1"]);
    expect(statuses(progress, "t1")).toEqual(["scheduled", "sent"]);
    // 到点后进入正常流程，可继续回报直至终态。
    c.onResult("t1", "published");
    expect(c.pendingCount()).toBe(0);
  });

  it("定时·未来：排程即 persistScheduled 落盘；到点触发 dropScheduled 出盘", () => {
    const ft = fakeTimers();
    const added: string[] = [];
    const dropped: string[] = [];
    const c = new PublishCoordinator(() => true, () => {}, {
      timers: ft.timers,
      now: () => 1000,
      persistScheduled: (t) => added.push(t.taskId),
      dropScheduled: (id) => dropped.push(id),
    });
    c.start({ ...task("t1"), scheduledAtMs: 5000 });
    expect(added).toEqual(["t1"]); // 排程即落盘
    expect(dropped).toEqual([]);
    ft.fireAll(); // 到点下发
    expect(dropped).toEqual(["t1"]); // 出盘（不再是「定时待发」）
  });

  it("定时·过点重排：直接 dispatch 也 dropScheduled 出盘（Hub 重启不重复下发同一视频）", () => {
    const added: string[] = [];
    const dropped: string[] = [];
    const c = new PublishCoordinator(() => true, () => {}, {
      now: () => 10_000,
      persistScheduled: (t) => added.push(t.taskId),
      dropScheduled: (id) => dropped.push(id),
    });
    // 模拟 Hub 重启后对一条已过点(scheduledAtMs<now)的持久化定时任务重排
    c.start({ ...task("t1"), scheduledAtMs: 5000 });
    expect(added).toEqual([]); // 过点不再落盘（非未来任务）
    expect(dropped).toEqual(["t1"]); // 但下发即出盘 → 不会每次重启都重发
  });

  it("定时·过去时刻：等同立即下发", () => {
    const { c, progress, sent } = mk(new Set(["d"]), undefined, () => 10_000);
    c.start({ ...task("t1"), scheduledAtMs: 5000 });
    expect(sent).toEqual(["t1"]);
    expect(statuses(progress, "t1")).toEqual(["sent"]);
  });

  it("定时到点前设备离线 → offline，不残留占位", () => {
    const ft = fakeTimers();
    const online = new Set<string>(["d"]);
    const { c, progress, sent } = mk(online, ft.timers, () => 1000);
    c.start({ ...task("t1"), scheduledAtMs: 5000 });
    online.delete("d"); // 到点前掉线
    ft.fireAll();
    expect(sent).toEqual([]);
    expect(statuses(progress, "t1")).toEqual(["scheduled", "offline"]);
    expect(c.pendingCount()).toBe(0);
  });
});
