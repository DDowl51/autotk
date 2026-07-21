import { describe, expect, it } from "vitest";
import type { Size } from "@auto/core";
import { isPrivateSubnet, scanForWda, subnet24Hosts, subnetOf, type WdaProbe } from "../src/discovery";

const S: Size = { width: 375, height: 667 };

describe("subnetOf / subnet24Hosts", () => {
  it("从本机 IP 取 /24 前缀", () => {
    expect(subnetOf("192.168.11.191")).toBe("192.168.11");
    expect(subnetOf("10.0.0.5")).toBe("10.0.0");
    expect(subnetOf("bogus")).toBeNull();
  });
  it("生成 x.1..x.254 共 254 个候选", () => {
    const hs = subnet24Hosts("192.168.11");
    expect(hs).toHaveLength(254);
    expect(hs[0]).toBe("192.168.11.1");
    expect(hs[253]).toBe("192.168.11.254");
  });
  it("私网段判定:192.168/10/172.16-31 为真;198.18(VPN)/100.64(CGNAT)/公网为假", () => {
    expect(isPrivateSubnet("192.168.11")).toBe(true);
    expect(isPrivateSubnet("10.0.0")).toBe(true);
    expect(isPrivateSubnet("172.16.5")).toBe(true);
    expect(isPrivateSubnet("172.31.9")).toBe(true);
    expect(isPrivateSubnet("172.32.0")).toBe(false); // 出了 16-31
    expect(isPrivateSubnet("198.18.0")).toBe(false); // 基准测试段(常见 VPN 虚拟网卡)
    expect(isPrivateSubnet("100.64.0")).toBe(false); // CGNAT
    expect(isPrivateSubnet("8.8.8")).toBe(false); // 公网
    expect(isPrivateSubnet("bogus")).toBe(false);
  });
});

describe("scanForWda", () => {
  it("只返回响应 :8100 的手机(带分辨率+URL),按 IP 数字序", async () => {
    const phones = new Set(["192.168.11.229", "192.168.11.12"]);
    const probe: WdaProbe = async (host) => (phones.has(host) ? S : null);
    const found = await scanForWda(["192.168.11.12", "192.168.11.5", "192.168.11.229"], probe);
    expect(found.map((f) => f.host)).toEqual(["192.168.11.12", "192.168.11.229"]); // 数字序,5 不响应被排除
    expect(found[0]).toEqual({ host: "192.168.11.12", port: 8100, wdaUrl: "http://192.168.11.12:8100", size: S });
  });

  it("probe 抛错(连不上)当作不是手机", async () => {
    const probe: WdaProbe = async (host) => {
      if (host === "192.168.11.9") throw new Error("ECONNREFUSED");
      return host === "192.168.11.10" ? S : null;
    };
    const found = await scanForWda(["192.168.11.9", "192.168.11.10"], probe);
    expect(found.map((f) => f.host)).toEqual(["192.168.11.10"]);
  });

  it("自定义端口", async () => {
    const probe: WdaProbe = async () => S;
    const found = await scanForWda(["10.0.0.2"], probe, { port: 8200 });
    expect(found[0].wdaUrl).toBe("http://10.0.0.2:8200");
  });

  it("并发不超过上限", async () => {
    let active = 0;
    let peak = 0;
    const release: (() => void)[] = [];
    const probe: WdaProbe = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((r) => release.push(r));
      active--;
      return null;
    };
    const done = scanForWda(subnet24Hosts("192.168.1"), probe, { concurrency: 8 });
    for (let i = 0; i < 254; i++) {
      while (release.length === 0) await Promise.resolve();
      release.shift()!();
    }
    await done;
    expect(peak).toBe(8);
  });
});
