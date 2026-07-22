import { describe, expect, it } from "vitest";
import { probeAll, summarize, type ProbeOne } from "../src/probe";
import type { ResolvedDevice } from "../src/config";

function devs(n: number): ResolvedDevice[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `d${i + 1}`,
    udid: `U${i + 1}`,
    wdaUrl: `http://10.0.0.${i + 1}:8100`,
    name: `d${i + 1}`,
    params: {},
    schedule: { allDay: true, windows: [] },
  }));
}

describe("probeAll", () => {
  it("全部可达:按原序返回 ok + size", async () => {
    const probeOne: ProbeOne = async (d) => ({ ok: true, size: { width: 375, height: 667 }, detail: `${d.id}-ok` });
    const out = await probeAll(devs(3), probeOne);
    expect(out.map((o) => o.id)).toEqual(["d1", "d2", "d3"]);
    expect(out.every((o) => o.ok && o.size?.width === 375)).toBe(true);
  });

  it("ok:false 与 抛错 都记为不可达(抛错取 message)", async () => {
    const probeOne: ProbeOne = async (d) => {
      if (d.id === "d2") return { ok: false, detail: "拒绝连接" };
      if (d.id === "d3") throw new Error("超时(20000ms)");
      return { ok: true, size: { width: 1, height: 1 }, detail: "ok" };
    };
    const out = await probeAll(devs(3), probeOne, { concurrency: 1 });
    expect(out.map((o) => [o.id, o.ok])).toEqual([["d1", true], ["d2", false], ["d3", false]]);
    expect(out[2].detail).toMatch(/超时/);
  });

  it("并发不超过上限(10 台 / 上限 3 → 峰值恰 3)", async () => {
    let active = 0;
    let peak = 0;
    const release: (() => void)[] = [];
    const probeOne: ProbeOne = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((r) => release.push(r)); // 挂起直到被放行
      active--;
      return { ok: true, size: { width: 1, height: 1 }, detail: "ok" };
    };
    const done = probeAll(devs(10), probeOne, { concurrency: 3 });
    for (let i = 0; i < 10; i++) {
      while (release.length === 0) await Promise.resolve(); // 让 worker 起到下一个等待点
      release.shift()!();
    }
    await done;
    expect(peak).toBe(3);
  });

  it("每台调 log 一次(可达/不可达文案不同)", async () => {
    const logs: string[] = [];
    const probeOne: ProbeOne = async (d) => (d.id === "d1" ? { ok: true, size: { width: 1, height: 1 }, detail: "1x1" } : { ok: false, detail: "down" });
    await probeAll(devs(2), probeOne, { log: (m) => logs.push(m) });
    expect(logs).toHaveLength(2);
    expect(logs.find((l) => l.includes("d1"))).toMatch(/可达/);
    expect(logs.find((l) => l.includes("d2"))).toMatch(/不可达/);
  });
});

describe("summarize", () => {
  it("数可达/不可达", () => {
    expect(summarize([{ id: "a", ok: true, detail: "" }, { id: "b", ok: false, detail: "" }, { id: "c", ok: true, detail: "" }])).toEqual({ reachable: 2, unreachable: 1 });
  });
});
