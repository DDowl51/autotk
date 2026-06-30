import * as SecureStore from "expo-secure-store";
import { TelemetryClient, type TelemetryStorage } from "./sdk";

// 手机端埋点封装：端点取 EXPO_PUBLIC_TELEMETRY_URL，没配则 no-op。
// 匿名 id 存 Keychain（expo-secure-store）。vendored SDK 在 ./sdk，改 telemetry/sdk 后手动同步。

let client: TelemetryClient | null = null;

const storage: TelemetryStorage = {
  getItem: (k) => SecureStore.getItemAsync(k),
  setItem: (k, v) => SecureStore.setItemAsync(k, v),
};

export function initTelemetry(): void {
  if (client) return;
  const base = process.env.EXPO_PUBLIC_TELEMETRY_URL?.replace(/\/$/, "");
  if (!base) return;
  client = new TelemetryClient({
    endpoint: `${base}/v1/events`,
    system: "autotk",
    appVersion: "autotk",
    storage,
  });
  void client.init();
  track("app_open");
}

export function track(name: string, props?: Record<string, unknown>): void {
  client?.track(name, props);
}
