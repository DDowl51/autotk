import { requireNativeModule } from "expo-modules-core";
import { setBaseUrl } from "../wda";
import { createOnDeviceUI, type DeviceProfile, type OcrFn } from "../engine/onDeviceUI";
import type { TikTokUI } from "../engine/tiktok-ui";
import type { OcrBox } from "../vision/caption";
import devices from "../../adaptation/devices.json";

/**
 * 构造真机 TikTokUI。
 *
 * 进入真机模式的硬前提是「有标定坐标」（没坐标点不准）；OCR 是可选项：
 * 有 VisionOcr 原生模块就读文案做精准对标,没有就降级为「不读文案」继续真机运行
 * （配合 posPrompts:["*"] 全互动）。这样原生模块没接上时也不会退回演示。
 */
export function createRealUI(log: (msg: string) => void): TikTokUI {
  // WDA 与本 App 同机,走 localhost。
  setBaseUrl("http://localhost:8100");

  // 取标定坐标（当前只标定了一台,取第一份；多机型后续按 windowSize 选）。
  // 没有标定坐标 → 真机模式无法工作 → 抛错,由调用方回退演示。
  const profiles = devices as Record<string, DeviceProfile>;
  const key = Object.keys(profiles)[0];
  const profile = profiles[key];
  if (!profile) {
    throw new Error("未找到标定坐标（adaptation/devices.json 为空,请先用 calibrate 标定本机）");
  }

  // OCR 可选:有原生模块用之,没有则空实现（不读文案,不影响其余真机操作）。
  let ocr: OcrFn;
  try {
    const native = requireNativeModule("VisionOcr") as {
      recognize: (b64: string) => Promise<OcrBox[]>;
    };
    ocr = (b64) => native.recognize(b64);
    log("OCR：Apple Vision 原生模块已启用");
  } catch {
    ocr = async () => [];
    log("OCR：未接入 VisionOcr 原生模块,降级为不读文案（posPrompts 建议用 [\"*\"] 全互动）");
  }

  return createOnDeviceUI({ profile, ocr, log });
}
