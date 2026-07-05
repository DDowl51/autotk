// netutil.cjs 是 Electron 主进程与 vitest 单测共用的无类型 CJS 工具，这里补类型声明供 TS 侧引用。
export function pickLanIPv4(
  interfaces: Record<string, ReadonlyArray<{ family: string; internal: boolean; address: string }> | undefined>,
): string;
export function encodeBeacon(port: number): string;
export function parseBeacon(text: string): { port: number } | null;
export const DISCOVERY_PORT: number;
export const HUB_PORTS: number[];
