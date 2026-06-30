import { TelemetryClient, type TelemetryStorage } from "./sdk";

// 服务端埋点封装：端点取 TELEMETRY_URL，没配则 no-op。匿名（无 PII），按启动会话归组。
// vendored SDK 在 ./sdk，改 telemetry/sdk 后需手动同步。

let client: TelemetryClient | null = null;

const memory: TelemetryStorage = (() => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
})();

export function initTelemetry(): void {
  if (client) return;
  const base = process.env.TELEMETRY_URL?.replace(/\/$/, "");
  if (!base) return;
  client = new TelemetryClient({
    endpoint: `${base}/v1/events`,
    system: "license-server",
    appVersion: "0.1.0",
    storage: memory,
  });
  void client.init();
}

export function track(name: string, props?: Record<string, unknown>): void {
  client?.track(name, props);
}
