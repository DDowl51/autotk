import { describe, it, expect } from "vitest";
import { startPublish, applyPublishProgress, publishRows, isPublishDone, type PublishMap } from "./publishState";

const mk = (): PublishMap =>
  startPublish(new Map(), {
    taskId: "t1",
    deviceId: "d1",
    deviceName: "手机A",
    videoName: "v.mp4",
    fileName: "v.mp4",
  }, 100);

describe("publishState", () => {
  it("startPublish 初始 queued", () => {
    const m = mk();
    expect(m.get("t1")?.status).toBe("queued");
  });

  it("applyPublishProgress 按 taskId 更新状态", () => {
    let m = mk();
    m = applyPublishProgress(m, { taskId: "t1", deviceId: "d1", status: "downloading" });
    m = applyPublishProgress(m, { taskId: "t1", deviceId: "d1", status: "published" });
    expect(m.get("t1")?.status).toBe("published");
  });

  it("失败带错误", () => {
    let m = mk();
    m = applyPublishProgress(m, { taskId: "t1", deviceId: "d1", status: "failed", error: "上传超时" });
    expect(m.get("t1")?.error).toBe("上传超时");
  });

  it("未知 taskId 忽略", () => {
    const m = mk();
    expect(applyPublishProgress(m, { taskId: "zzz", deviceId: "d1", status: "published" })).toBe(m);
  });

  it("不可变 + 最近在前", () => {
    let m = mk();
    m = startPublish(m, { taskId: "t2", deviceId: "d1", deviceName: "手机A", videoName: "b.mp4", fileName: "b.mp4" }, 200);
    expect(publishRows(m).map((r) => r.taskId)).toEqual(["t2", "t1"]);
  });

  it("isPublishDone 终态判断", () => {
    expect(isPublishDone("published")).toBe(true);
    expect(isPublishDone("failed")).toBe(true);
    expect(isPublishDone("downloading")).toBe(false);
    expect(isPublishDone("queued")).toBe(false);
  });
});
