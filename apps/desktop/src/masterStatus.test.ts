import { describe, expect, it } from "vitest";
import { createMasterStatusTracker, parseSubnets } from "../electron/master-status.cjs";

describe("master stdout/stderr 状态聚合", () => {
  it("从分片 stdout 解析 VLM、网段、扫描时间与发现/上线数", () => {
    let now = 1_000;
    const tracker = createMasterStatusTracker({ now: () => now });
    tracker.beginStart({ vlmUrl: "http://localhost:8000", subnets: "192.168.1, 10.0.0" });
    tracker.markRunning(4321);

    tracker.ingest("stdout", "自动发现:扫 192.168.1.1-254 / 10.0.0.1-");
    tracker.ingest(
      "stdout",
      "254 的 :8100(WDA)…\n  发现手机 192.168.1.20:8100 (375x667)\n自动发现:扫描完成,发现 2 台\n",
    );
    tracker.ingest(
      "stdout",
      "自动发现:合并配置后共 5 台\n\u001b[32m配置 devices.json:5 台;VLM http://gpu.lan:8000 (locateanything-3b)\u001b[0m\n+ 上线 auto-20(192.168.1.20) 375x667\n+ 上线 auto-20(192.168.1.20) 375x667\n+ 上线 auto-21(192.168.1.21) 375x667\n已上线 2 台(错峰 3000ms/台)。\n",
    );

    expect(tracker.snapshot()).toEqual({
      running: true,
      restarting: false,
      pid: 4321,
      vlmUrl: "http://gpu.lan:8000",
      subnets: ["192.168.1", "10.0.0"],
      lastScanAt: 1_000,
      discoveredCount: 2,
      onlineCount: 2,
      lastError: null,
    });

    now = 2_000;
    tracker.ingest("stdout", "自动发现:重扫完成,发现 3 台\n");
    expect(tracker.snapshot()).toMatchObject({ lastScanAt: 2_000, discoveredCount: 3 });
  });

  it("兼容旧 master 合并日志，并保留最近错误与意外退出状态", () => {
    let now = 5_000;
    const tracker = createMasterStatusTracker({ now: () => now });
    tracker.beginStart({ vlmUrl: "http://localhost:8000" });
    tracker.markRunning(99);
    tracker.ingest("stdout", "自动发现:合并配置后共 4 台\n");
    now = 6_000;
    tracker.ingest("stdout", "重扫失败: WDA timeout\n");
    expect(tracker.snapshot()).toMatchObject({ lastScanAt: 6_000, lastError: "重扫失败: WDA timeout" });
    tracker.ingest(
      "stderr",
      "VLM connection refused\n(node:12) DeprecationWarning: old API\n    at main (run.ts:1:1)\nELIFECYCLE Command failed\n",
    );
    tracker.markStopped({ code: 1 });

    expect(tracker.snapshot()).toMatchObject({
      running: false,
      restarting: false,
      pid: null,
      lastScanAt: 6_000,
      discoveredCount: 4,
      lastError: "VLM connection refused",
    });
  });

  it("新一轮启动清空旧计数/错误，启动失败可见", () => {
    const tracker = createMasterStatusTracker();
    tracker.beginStart({ vlmUrl: "http://old:8000", subnets: "192.168.11" });
    tracker.markRunning(1);
    tracker.ingest("stderr", "old error\n");
    tracker.beginStart({ vlmUrl: "http://new:8000", subnets: "10.0.0;10.0.1" });

    expect(tracker.snapshot()).toMatchObject({
      running: false,
      restarting: true,
      vlmUrl: "http://new:8000",
      subnets: ["10.0.0", "10.0.1"],
      discoveredCount: 0,
      onlineCount: 0,
      lastError: null,
    });

    tracker.markFailed(new Error("spawn pnpm ENOENT"));
    expect(tracker.snapshot()).toMatchObject({
      running: false,
      restarting: false,
      lastError: "spawn pnpm ENOENT",
    });
  });

  it("规整多个显式网段并去重", () => {
    expect(parseSubnets("192.168.11.1-254 / 192.168.11.x, 10.0.0;999.1.1;bad")).toEqual([
      "192.168.11",
      "10.0.0",
    ]);
  });

  it("状态变化实时推送，相同状态不重复推送，退出时 flush 半行 stderr", () => {
    const updates: Array<{ running: boolean; lastError: string | null }> = [];
    const tracker = createMasterStatusTracker({
      onChange: (status) => updates.push({ running: status.running, lastError: status.lastError }),
    });

    tracker.beginStart({ vlmUrl: "http://gpu:8000" });
    tracker.markRunning(7);
    tracker.markRunning(7);
    tracker.ingest("stderr", "最后一条错误没有换行");
    tracker.markStopped({ code: 1 });

    expect(updates).toEqual([
      { running: false, lastError: null },
      { running: true, lastError: null },
      { running: true, lastError: "最后一条错误没有换行" },
      { running: false, lastError: "最后一条错误没有换行" },
    ]);
  });
});
