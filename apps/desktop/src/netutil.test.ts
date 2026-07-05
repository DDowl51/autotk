import { describe, it, expect } from "vitest";
// 从 Electron 主进程共用的 CJS 工具里取；vitest/esbuild 处理 CJS 具名导出。
import { pickLanIPv4 } from "../electron/netutil.cjs";

const v4 = (address: string, internal = false) => ({ family: "IPv4", internal, address });

describe("pickLanIPv4：优先真·物理网卡，跳过虚拟/VPN/APIPA", () => {
  it("多网卡混杂时选 WLAN 而非 VMware/Tailscale（复刻真机 bug 192.168.163.1）", () => {
    const ifs = {
      Tailscale: [v4("100.104.138.9")],
      "VMware Network Adapter VMnet1": [v4("192.168.163.1")],
      "VMware Network Adapter VMnet8": [v4("192.168.85.1")],
      WLAN: [v4("192.168.10.10")],
      "Loopback Pseudo-Interface 1": [v4("127.0.0.1", true)],
      "vEthernet (nat)": [v4("172.28.224.1")],
    };
    expect(pickLanIPv4(ifs)).toBe("192.168.10.10");
  });

  it("以太网（含中文/英文命名）也算真网卡，胜过虚拟网卡", () => {
    expect(
      pickLanIPv4({
        "VMware Network Adapter VMnet1": [v4("192.168.163.1")],
        以太网: [v4("192.168.1.50")],
      }),
    ).toBe("192.168.1.50");
    expect(
      pickLanIPv4({
        Ethernet: [v4("10.0.0.20")],
        "vEthernet (WSL)": [v4("172.28.0.1")],
      }),
    ).toBe("10.0.0.20");
  });

  it("跳过 APIPA 169.254.*，选真正拿到地址的网卡", () => {
    expect(
      pickLanIPv4({
        "以太网 2": [v4("169.254.5.5")],
        WLAN: [v4("10.0.0.5")],
      }),
    ).toBe("10.0.0.5");
  });

  it("只剩虚拟网卡时兜底给它的私网地址（总比回环强）", () => {
    expect(pickLanIPv4({ "VMware Network Adapter VMnet1": [v4("192.168.163.1")] })).toBe("192.168.163.1");
  });

  it("啥都没有 → 回环兜底", () => {
    expect(pickLanIPv4({})).toBe("127.0.0.1");
    expect(pickLanIPv4({ "Loopback Pseudo-Interface 1": [v4("127.0.0.1", true)] })).toBe("127.0.0.1");
  });
});
