import { describe, it, expect } from "vitest";
import { applyLogs, clearLogs, getLogs, type LogMap } from "./logs";

const line = (msg: string) => ({ level: "info" as const, msg, ts: 0 });

describe("logs reducer", () => {
  it("replace 全量替换", () => {
    let m: LogMap = new Map();
    m = applyLogs(m, "d", [line("old")]);
    m = applyLogs(m, "d", [line("a"), line("b")], true);
    expect(getLogs(m, "d").map((l) => l.msg)).toEqual(["a", "b"]);
  });

  it("增量追加", () => {
    let m: LogMap = new Map();
    m = applyLogs(m, "d", [line("a")], true);
    m = applyLogs(m, "d", [line("b")]);
    m = applyLogs(m, "d", [line("c")]);
    expect(getLogs(m, "d").map((l) => l.msg)).toEqual(["a", "b", "c"]);
  });

  it("超 cap 丢最旧", () => {
    let m: LogMap = new Map();
    m = applyLogs(m, "d", [line("1"), line("2"), line("3")], true, 2);
    expect(getLogs(m, "d").map((l) => l.msg)).toEqual(["2", "3"]);
    m = applyLogs(m, "d", [line("4")], false, 2);
    expect(getLogs(m, "d").map((l) => l.msg)).toEqual(["3", "4"]);
  });

  it("不可变：返回新 Map，不改旧的", () => {
    const m0: LogMap = new Map();
    const m1 = applyLogs(m0, "d", [line("a")]);
    expect(m0.size).toBe(0);
    expect(m1.size).toBe(1);
  });

  it("各设备互不干扰", () => {
    let m: LogMap = new Map();
    m = applyLogs(m, "d1", [line("a")]);
    m = applyLogs(m, "d2", [line("b")]);
    expect(getLogs(m, "d1").map((l) => l.msg)).toEqual(["a"]);
    expect(getLogs(m, "d2").map((l) => l.msg)).toEqual(["b"]);
  });

  it("clearLogs 删除该台缓冲", () => {
    let m: LogMap = new Map();
    m = applyLogs(m, "d", [line("a")]);
    m = clearLogs(m, "d");
    expect(getLogs(m, "d")).toEqual([]);
    // 删不存在的不报错、原样返回。
    expect(clearLogs(m, "nope")).toBe(m);
  });
});
