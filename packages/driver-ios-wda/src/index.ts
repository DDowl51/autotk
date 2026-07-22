// @auto/driver-ios-wda — Driver 的 iOS/WDA 实现(平台层;未来 iOS 别的 app 复用)。
import type { Driver } from "@auto/core";
import { WdaClient, WdaError } from "./client";

const TIKTOK_BUNDLE_ID = "com.zhiliaoapp.musically";

export { WdaClient, WdaError };

/**
 * 建一台手机的 Driver。baseUrl = http://<手机IP>:8100。
 * 每台手机一个独立实例(自带 session),支持一进程并发多台。
 */
export function createIosWdaDriver(baseUrl: string, opts?: { timeoutMs?: number }): Driver {
  const c = new WdaClient(baseUrl, opts?.timeoutMs);
  return {
    screenshot: () => c.screenshot(),
    tap: (p) => c.tap(p),
    swipe: (from, to, durMs) => c.swipe(from, to, durMs),
    typeText: (s) => c.typeText(s),
    activateApp: (appId = TIKTOK_BUNDLE_ID) => c.activateApp(appId),
    ensureHealthy: () => c.ensureHealthy(),
    windowSize: () => c.windowSize(),
  };
}
