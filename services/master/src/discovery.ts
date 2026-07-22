// 局域网自动感知(替代手工 devices.json 的第一块):扫子网的 :8100(WDA)发现手机。
// 纯编排,探活动作由 probe 注入 → 可测。设备身份用 IP(配 DHCP 静态租约后稳定)。
import type { Size } from "@auto/core";

export const DEFAULT_WDA_PORT = 8100;

export interface Discovered {
  host: string;
  port: number;
  wdaUrl: string;
  size: Size;
}

/** 探一个 host 的 WDA:是手机返回逻辑分辨率,否则 null(超时/拒绝/非手机)。 */
export type WdaProbe = (host: string, port: number) => Promise<Size | null>;

/** 从本机 IPv4 取 /24 前缀:"192.168.11.191" → "192.168.11";非法 → null。 */
export function subnetOf(ip: string): string | null {
  const m = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  return m ? m[1] : null;
}

/** /24 子网候选:base 如 "192.168.11" → x.1 .. x.254(跳过 .0 网络地址与 .255 广播)。 */
export function subnet24Hosts(base: string): string[] {
  return Array.from({ length: 254 }, (_, i) => `${base}.${i + 1}`);
}

/**
 * 是否「像手机 LAN 的私网 /24」:192.168.x / 10.x / 172.16-31.x。
 * 用于自动挑网段时排除 VPN/虚拟网卡常见的非 LAN 段(198.18.x 基准测试段、100.64-127 CGNAT 等)——
 * 真机日志里就出现过误扫 198.18.0.x 的坑(2026-07-21)。MASTER_SUBNET 显式指定则不受此限。
 */
export function isPrivateSubnet(base: string): boolean {
  const p = base.split(".").map(Number);
  if (p.length !== 3 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  if (a === 192 && b === 168) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * 解析用户填/传的网段串(逗号或空格分隔)→ 合法 /24 前缀列表。
 * 手动指定=信任用户(不强制私网,买家网络五花八门);只做格式过滤(x.y.z)+去重。
 * 供分发场景:买家手机分布在多个段(如 192.168.1 与 192.168.11)时,填 "192.168.1, 192.168.11" 全扫。
 */
export function parseSubnetList(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.split(/[\s,;]+/)) {
    const x = raw.trim();
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(x) && x.split(".").every((n) => Number(n) >= 0 && Number(n) <= 255) && !out.includes(x)) {
      out.push(x);
    }
  }
  return out;
}

/** 并发扫描候选 host 的 :port(默认 8100),返回可达手机(带分辨率+URL),按 IP 数字序。 */
export async function scanForWda(
  hosts: string[],
  probe: WdaProbe,
  opts: { concurrency?: number; port?: number; log?: (m: string) => void } = {},
): Promise<Discovered[]> {
  const port = opts.port ?? DEFAULT_WDA_PORT;
  const concurrency = Math.max(1, opts.concurrency ?? 32);
  const found: Discovered[] = [];
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= hosts.length) return;
      const host = hosts[i];
      let size: Size | null = null;
      try {
        size = await probe(host, port);
      } catch {
        size = null; // 连不上/超时 = 不是手机
      }
      if (size) {
        found.push({ host, port, wdaUrl: `http://${host}:${port}`, size });
        opts.log?.(`发现手机 ${host}:${port} (${size.width}x${size.height})`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, hosts.length) }, worker));
  found.sort((a, b) => a.host.localeCompare(b.host, undefined, { numeric: true }));
  return found;
}
