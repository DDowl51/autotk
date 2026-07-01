/**
 * 自动发现 beacon 编解码（纯逻辑，便于单测）。
 * 契约与桌面端 apps/desktop/electron/netutil.cjs 一致：桌面广播 { svc, port }，
 * 手机从 UDP 包的来源 IP + 此 port 组成 Hub 地址。
 */
export interface Beacon {
  port: number;
}

export function encodeBeacon(port: number): string {
  return JSON.stringify({ svc: "autotk-hub", port });
}

export function parseBeacon(text: string): Beacon | null {
  try {
    const o = JSON.parse(text) as { svc?: unknown; port?: unknown };
    if (o && o.svc === "autotk-hub" && Number.isInteger(o.port) && (o.port as number) > 0) {
      return { port: o.port as number };
    }
  } catch {
    /* 坏数据忽略 */
  }
  return null;
}

/** 与桌面端一致的自动发现 UDP 端口。 */
export const DISCOVERY_PORT = 41234;
