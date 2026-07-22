import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { lanAddress, LanFileServer } from "../src/lan-server";

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

describe("LanFileServer 持久化：桌面重启后旧下发 URL 仍可用（修 C2）", () => {
  it("register/端口落盘 → 新实例 restore 后 token 映射与端口都恢复", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lanfs-"));
    const persist = path.join(dir, "lan.json");
    try {
      const s1 = new LanFileServer(persist);
      await s1.start("127.0.0.1", 0);
      const savedPort = s1.getPort();
      const token = s1.register("/abs/v.mp4");
      await s1.close(); // flush 落盘

      // 模拟桌面重启：新实例从同一文件恢复
      const s2 = new LanFileServer(persist);
      const restoredPort = await s2.restore();
      expect(restoredPort).toBe(savedPort); // 端口被记住 → 旧 URL 里的端口能复用
      // 同一文件再 register 复用恢复出来的同一 token（证明 token→路径映射已加载）→ 旧 URL 仍命中
      expect(s2.register("/abs/v.mp4")).toBe(token);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("无持久化文件（老行为）：restore 返回 undefined、不落盘", async () => {
    const s = new LanFileServer(); // 不传 persistFile
    expect(await s.restore()).toBeUndefined();
    const t = s.register("/abs/x.mp4");
    expect(t).toMatch(/^[a-f0-9]+$/); // 仍正常发 token，只是不落盘
  });
});
