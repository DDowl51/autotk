import { describe, expect, it } from "vitest";
import type { RunStats } from "@auto/core";
import { toDeviceStatus } from "../src/hub/statusReporter";

const stats: RunStats = {
  videosWatched: 12,
  likes: 5,
  saves: 2,
  follows: 1,
  commentLikes: 4,
  commentReplies: 3,
  dmSent: 6,
  dmFailed: 2,
};
const handle = { getStats: () => stats, getModule: () => "search", getAlert: () => null };

describe("toDeviceStatus", () => {
  it("RunStats → 协议 stats(含 dmSent/dmFailed);module/alert/running 透传", () => {
    const s = toDeviceStatus(handle, { running: true, ts: 1000 });
    expect(s.running).toBe(true);
    expect(s.module).toBe("search");
    expect(s.alert).toBeNull();
    expect(s.ts).toBe(1000);
    expect(s.stats).toEqual({ likes: 5, follows: 1, comments: 3, videos: 12, dmSent: 6, dmFailed: 2 });
  });

  it("alert 有值 + page/battery 透传", () => {
    const h = { getStats: () => stats, getModule: () => null, getAlert: () => "卡死告警" };
    const s = toDeviceStatus(h, { running: false, ts: 2, page: "comments", battery: { level: 80, charging: true } });
    expect(s.running).toBe(false);
    expect(s.module).toBeUndefined(); // null module → 省略
    expect(s.alert).toBe("卡死告警");
    expect(s.page).toBe("comments");
    expect(s.battery).toEqual({ level: 80, charging: true });
  });

  it("battery 未给则省略字段", () => {
    const s = toDeviceStatus(handle, { running: true, ts: 0 });
    expect("battery" in s).toBe(false);
  });
});
