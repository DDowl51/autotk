import { describe, it, expect } from "vitest";
import { createTracker } from "../src/adapters/telemetry";

describe("createTracker", () => {
  it("没配 collectorUrl → no-op，不报错", () => {
    const track = createTracker({ anonId: "x" });
    expect(() => track("ota_scan", { app: "wda" })).not.toThrow();
  });

  it("配了就 POST 到 /v1/events，载荷符合 collector 契约", async () => {
    const calls: Array<{ url: string; body: any }> = [];
    const track = createTracker({
      collectorUrl: "https://t.cn/",
      anonId: "station-1",
      appVersion: "0.1.0",
      now: () => 123,
      fetchImpl: async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return {};
      },
    });
    track("ota_sign", { app: "wda", account: "a" });
    await Promise.resolve(); // 让 fire-and-forget 落地
    await Promise.resolve();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://t.cn/v1/events"); // 末尾斜杠去掉
    expect(calls[0].body).toMatchObject({
      system: "signing-station",
      anonId: "station-1",
      appVersion: "0.1.0",
      events: [{ name: "ota_sign", props: { app: "wda", account: "a" }, ts: 123 }],
    });
  });

  it("fetch 抛错不冒泡（不影响主流程）", async () => {
    const track = createTracker({
      collectorUrl: "https://t.cn",
      anonId: "x",
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    expect(() => track("ota_error", {})).not.toThrow();
    await Promise.resolve();
  });
});
