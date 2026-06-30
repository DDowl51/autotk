import { describe, it, expect } from "vitest";
import { LogHub } from "../src/domain/log-hub";

const line = (msg: string) => ({ level: "info" as const, msg, ts: 0 });

describe("LogHub 环形缓冲", () => {
  it("append 返回追加行，snapshot 取全量", () => {
    const h = new LogHub(10);
    expect(h.append("d", [line("a"), line("b")])).toHaveLength(2);
    expect(h.snapshot("d").map((l) => l.msg)).toEqual(["a", "b"]);
  });

  it("空 append 不报错、返回空", () => {
    const h = new LogHub();
    expect(h.append("d", [])).toEqual([]);
    expect(h.snapshot("d")).toEqual([]);
  });

  it("超过 cap 丢最旧，只留最近 cap 条", () => {
    const h = new LogHub(3);
    h.append("d", [line("1"), line("2")]);
    h.append("d", [line("3"), line("4")]);
    expect(h.snapshot("d").map((l) => l.msg)).toEqual(["2", "3", "4"]);
  });

  it("snapshot 返回副本，外部修改不影响内部", () => {
    const h = new LogHub();
    h.append("d", [line("a")]);
    h.snapshot("d").push(line("x"));
    expect(h.snapshot("d")).toHaveLength(1);
  });

  it("各设备缓冲互不干扰", () => {
    const h = new LogHub();
    h.append("d1", [line("a")]);
    h.append("d2", [line("b")]);
    expect(h.snapshot("d1").map((l) => l.msg)).toEqual(["a"]);
    expect(h.snapshot("d2").map((l) => l.msg)).toEqual(["b"]);
  });
});

describe("LogHub watcher 管理", () => {
  it("首个 watcher 返回 true，第二个返回 false", () => {
    const h = new LogHub();
    expect(h.addWatcher("d", "op1")).toBe(true);
    expect(h.addWatcher("d", "op2")).toBe(false);
    expect(h.isWatched("d")).toBe(true);
    expect(h.watchersOf("d").sort()).toEqual(["op1", "op2"]);
  });

  it("移除非最后一个返回 false，移除最后一个返回 true", () => {
    const h = new LogHub();
    h.addWatcher("d", "op1");
    h.addWatcher("d", "op2");
    expect(h.removeWatcher("d", "op1")).toBe(false);
    expect(h.removeWatcher("d", "op2")).toBe(true);
    expect(h.isWatched("d")).toBe(false);
  });

  it("移除不存在的 watcher 返回 false", () => {
    const h = new LogHub();
    h.addWatcher("d", "op1");
    expect(h.removeWatcher("d", "nope")).toBe(false);
    expect(h.removeWatcher("other", "op1")).toBe(false);
  });

  it("removeWatcherEverywhere 返回因此清空的设备", () => {
    const h = new LogHub();
    h.addWatcher("d1", "op1");
    h.addWatcher("d2", "op1");
    h.addWatcher("d2", "op2"); // d2 还有 op2，不会清空
    const emptied = h.removeWatcherEverywhere("op1");
    expect(emptied).toEqual(["d1"]);
    expect(h.isWatched("d2")).toBe(true);
  });
});
