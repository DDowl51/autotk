import { requireNativeModule } from "expo-modules-core";
import { setBaseUrl, createSession, applyFastSettings, getSessionId, windowSize } from "../wda";
import { createOnDeviceUI, type DeviceProfile, type OcrFn } from "../engine/onDeviceUI";
import { pickProfile } from "../engine/deviceSelect";
import type { TikTokUI } from "../engine/tiktok-ui";
import type { OcrBox } from "../vision/caption";
import { track } from "../telemetry";
import devices from "../../adaptation/devices.json";

/**
 * 构造真机 TikTokUI。
 *
 * 进入真机模式的硬前提是「有标定坐标」（没坐标点不准）；OCR 是可选项：
 * 有 VisionOcr 原生模块就读文案做精准对标,没有就降级为「不读文案」继续真机运行
 * （配合 posPrompts:["*"] 全互动）。这样原生模块没接上时也不会退回演示。
 *
 * 多机型：按真机实际分辨率选对应标定档案（pickProfile）；查不到精确匹配时用任一份兜底并告警。
 */
export async function createRealUI(log: (msg: string) => void): Promise<TikTokUI> {
  // WDA 与本 App 同机,走 localhost。
  setBaseUrl("http://localhost:8100");

  const profiles = devices as Record<string, DeviceProfile>;
  const keys = Object.keys(profiles);
  if (keys.length === 0) {
    throw new Error("未找到标定坐标（adaptation/devices.json 为空,请先用 calibrate 标定本机）");
  }

  // 探一次真机分辨率，按机型选 profile（复用会话，onDeviceUI 之后不会再建）。
  let profile: DeviceProfile | undefined;
  try {
    if (!getSessionId()) {
      await createSession();
      await applyFastSettings();
    }
    const { width, height } = await windowSize();
    profile = pickProfile(profiles, width, height);
    if (profile) {
      log(`机型匹配：${width}x${height} 标定档案`);
    } else {
      log(`未找到 ${width}x${height} 的标定，用 ${keys[0]} 兜底（建议对本机重新 calibrate）`);
    }
  } catch (e) {
    log(`取分辨率失败，用 ${keys[0]} 兜底：${e instanceof Error ? e.message : String(e)}`);
  }
  profile = profile ?? profiles[keys[0]];

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

  return createOnDeviceUI({ profile, ocr, log, onEvent: track });
}
