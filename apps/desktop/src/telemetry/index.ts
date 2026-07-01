import { TelemetryClient } from "./sdk";

// 桌面端埋点封装：端点由 VITE_TELEMETRY_URL 配置；没配则全程 no-op（不影响使用）。
// vendored SDK 在 ./sdk，改 telemetry/sdk 后需手动同步。只收匿名数据，无 PII。

let client: TelemetryClient | null = null;

export function initTelemetry(): void {
  if (client) return;
  const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
  const base = env.VITE_TELEMETRY_URL?.replace(/\/$/, "");
  if (!base) return; // 未配置 → 关闭
  client = new TelemetryClient({
    endpoint: `${base}/v1/events`,
    system: "management-center",
    appVersion: "1.0.0",
    fetch: (u, i) => fetch(u as string, i as RequestInit),
    storage: {
      getItem: (k) => {
        try {
          return localStorage.getItem(k);
        } catch {
          return null;
        }
      },
      setItem: (k, v) => {
        try {
          localStorage.setItem(k, v);
        } catch {
          /* 忽略 */
        }
      },
    },
  });
  void client.init();
  track("app_open");
}

export function track(name: string, props?: Record<string, unknown>): void {
  client?.track(name, props);
}
