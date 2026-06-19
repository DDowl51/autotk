import { setBaseUrl } from "../wda";
import { createOnDeviceUI, type DeviceProfile, type OcrFn } from "../engine/onDeviceUI";
import type { TikTokUI } from "../engine/tiktok-ui";
import devices from "../../adaptation/devices.json";

/**
 * 构造真机 TikTokUI（仅在含 vision-ocr 原生模块的 dev build 上可用）。
 * 失败（如 Expo Go 无原生模块）时抛错，由调用方回退到演示模式。
 */
export function createRealUI(log: (msg: string) => void): TikTokUI {
  // WDA 与本 App 同机，走 localhost。
  setBaseUrl("http://localhost:8100");

  // 运行时加载原生 OCR 模块；Expo Go 里没有 → 抛错 → 回退演示模式。
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ocr: OcrFn = (require("vision-ocr") as typeof import("vision-ocr")).recognize;

  // 取标定坐标（当前只标定了一台，取第一份；多机型后续按 windowSize 选）。
  const profiles = devices as Record<string, DeviceProfile>;
  const key = Object.keys(profiles)[0];
  const profile = profiles[key];
  if (!profile) throw new Error("未找到标定坐标（adaptation/devices.json 为空）");

  return createOnDeviceUI({ profile, ocr, log });
}
