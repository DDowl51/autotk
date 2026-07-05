import { describe, it, expect } from "vitest";
import { lanAddress } from "../src/lan-server";

const v4 = (address: string, internal = false) => ({
  family: "IPv4" as const,
  internal,
  address,
  netmask: "255.255.255.0",
  mac: "00:00:00:00:00:00",
  cidr: null,
});

describe("lanAddress：LAN 下载 URL 优先真·物理网卡，跳过虚拟/VPN", () => {
  it("有 VMware/Tailscale 时选 WLAN，而非 192.168.163.1（修真机下载 503 的错 IP）", () => {
    const ifs = {
      Tailscale: [v4("100.104.138.9")],
      "VMware Network Adapter VMnet1": [v4("192.168.163.1")],
      "VMware Network Adapter VMnet8": [v4("192.168.85.1")],
      WLAN: [v4("192.168.10.10")],
      "Loopback Pseudo-Interface 1": [v4("127.0.0.1", true)],
      "vEthernet (nat)": [v4("172.28.224.1")],
    };
    expect(lanAddress(ifs as never)).toBe("192.168.10.10");
  });

  it("以太网也算真网卡；跳过 APIPA 169.254.*", () => {
    expect(lanAddress({ Ethernet: [v4("10.0.0.20")], "vEthernet (WSL)": [v4("172.28.0.1")] } as never)).toBe("10.0.0.20");
    expect(lanAddress({ "以太网 2": [v4("169.254.5.5")], WLAN: [v4("192.168.1.9")] } as never)).toBe("192.168.1.9");
  });

  it("只剩虚拟网卡 → 兜底给虚拟私网（总比 undefined 强）；全空 → undefined", () => {
    expect(lanAddress({ "VMware Network Adapter VMnet1": [v4("192.168.163.1")] } as never)).toBe("192.168.163.1");
    expect(lanAddress({} as never)).toBeUndefined();
  });
});
