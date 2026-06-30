import { describe, it, expect } from "vitest";
import { startJob, applyProgress, summarizeJob, retriableDeviceIds, jobRows } from "./configJobs";

const devs = [
  { deviceId: "a", deviceName: "甲" },
  { deviceId: "b", deviceName: "乙" },
  { deviceId: "c", deviceName: "丙" },
];

describe("configJobs reducer", () => {
  it("startJob 初始全 pending", () => {
    const j = startJob("j1", devs);
    const s = summarizeJob(j);
    expect(s).toMatchObject({ total: 3, pending: 3, ok: 0, done: false });
  });

  it("逐台进度归并：sent→ok / offline / timeout", () => {
    let j = startJob("j1", devs);
    j = applyProgress(j, { jobId: "j1", deviceId: "a", status: "sent" });
    j = applyProgress(j, { jobId: "j1", deviceId: "a", status: "ok" });
    j = applyProgress(j, { jobId: "j1", deviceId: "b", status: "offline" });
    j = applyProgress(j, { jobId: "j1", deviceId: "c", status: "sent" });
    j = applyProgress(j, { jobId: "j1", deviceId: "c", status: "timeout" });
    const s = summarizeJob(j);
    expect(s).toMatchObject({ ok: 1, offline: 1, timeout: 1, pending: 0, done: true });
  });

  it("failed 带错误信息", () => {
    let j = startJob("j1", devs);
    j = applyProgress(j, { jobId: "j1", deviceId: "a", status: "failed", error: "占比超范围" });
    expect(jobRows(j).find((r) => r.deviceId === "a")?.error).toBe("占比超范围");
  });

  it("jobId 不匹配的进度被忽略", () => {
    const j = startJob("j1", devs);
    const j2 = applyProgress(j, { jobId: "other", deviceId: "a", status: "ok" });
    expect(j2).toBe(j);
  });

  it("不在任务里的设备被忽略", () => {
    const j = startJob("j1", devs);
    const j2 = applyProgress(j, { jobId: "j1", deviceId: "zzz", status: "ok" });
    expect(j2).toBe(j);
  });

  it("终态不被迟到的非终态覆盖", () => {
    let j = startJob("j1", devs);
    j = applyProgress(j, { jobId: "j1", deviceId: "a", status: "timeout" });
    j = applyProgress(j, { jobId: "j1", deviceId: "a", status: "sent" }); // 迟到
    expect(jobRows(j).find((r) => r.deviceId === "a")?.status).toBe("timeout");
  });

  it("retriableDeviceIds = 失败/超时/离线", () => {
    let j = startJob("j1", devs);
    j = applyProgress(j, { jobId: "j1", deviceId: "a", status: "ok" });
    j = applyProgress(j, { jobId: "j1", deviceId: "b", status: "failed" });
    j = applyProgress(j, { jobId: "j1", deviceId: "c", status: "offline" });
    expect(retriableDeviceIds(j).sort()).toEqual(["b", "c"]);
  });

  it("不可变：applyProgress 返回新对象", () => {
    const j = startJob("j1", devs);
    const j2 = applyProgress(j, { jobId: "j1", deviceId: "a", status: "ok" });
    expect(j2).not.toBe(j);
    expect(summarizeJob(j).ok).toBe(0); // 旧的没变
  });

  it("null 安全", () => {
    expect(summarizeJob(null)).toMatchObject({ total: 0, done: false });
    expect(retriableDeviceIds(null)).toEqual([]);
    expect(applyProgress(null, { jobId: "j1", deviceId: "a", status: "ok" })).toBeNull();
  });
});
