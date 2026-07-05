import { requireNativeModule } from "expo-modules-core";
import {
  setBaseUrl,
  createSession,
  applyFastSettings,
  getSessionId,
  windowSize,
  activateApp,
  screenshot,
  TIKTOK_BUNDLE_ID,
} from "../wda";
import { createOnDeviceUI, type DeviceProfile, type OcrFn } from "../engine/onDeviceUI";
import { pickProfile } from "../engine/deviceSelect";
import { validateRail, nearestProfileKey } from "../engine/railCheck";
import { decode, detectRail } from "../vision/detect";
import { getStoredProfiles, saveStoredProfile } from "./deviceProfileStore";
import type { TikTokUI } from "../engine/tiktok-ui";
import type { OcrBox } from "../vision/caption";
import { track } from "../telemetry";
import devices from "../../adaptation/devices.json";

/**
 * 首跑自动标定：本机当前若停在干净视频页，检测右栏 → 校验 → 存 AsyncStorage 并返回。
 * 不在干净页/检测非法 → 返回 undefined（上层用最接近档兜底）。
 */
async function tryAutoCalibrate(
  w: number,
  h: number,
  log: (m: string) => void,
): Promise<DeviceProfile | undefined> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await activateApp(TIKTOK_BUNDLE_ID);
  // activateApp 只是把 TikTok 切前台，视频页/右侧动作栏还要额外时间渲染——立刻截图必检测失败
  // （真机实测第一条日志就是「自动标定未成功」）。先给 1.5s 打底，再轮询「检测到干净视频页」为止，
  // 最多 ~6s；期间失败不吭声，只有全程都没成才在最后报一次。
  await sleep(1500);
  let lastReason = "未在干净视频页";
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const rail = detectRail(decode(await screenshot()), w, h); // 白带 <4 会抛
      const v = validateRail(rail, w, h);
      if (v.ok) {
        const prof: DeviceProfile = {
          screen: { w, h },
          like: rail.like,
          comment: rail.comment,
          save: rail.save,
          share: rail.share,
          follow: rail.follow,
        };
        await saveStoredProfile(`${w}x${h}`, prof);
        return prof;
      }
      lastReason = v.reason ?? "校验未通过";
    } catch (e) {
      lastReason = e instanceof Error ? e.message : String(e);
    }
    await sleep(750);
  }
  log(`自动标定未成功（可能不在干净视频页）：${lastReason}`);
  return undefined;
}

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

  // 出厂档（打包只读）+ 端上标定档（首跑自动标定/本机 calibrate 存的）合并，后者覆盖前者。
  const stored = await getStoredProfiles();
  const profiles: Record<string, DeviceProfile> = { ...(devices as Record<string, DeviceProfile>), ...stored };

  // 探一次真机分辨率，按机型选 profile（复用会话，onDeviceUI 之后不会再建）。
  let profile: DeviceProfile | undefined;
  let width = 0;
  let height = 0;
  try {
    if (!getSessionId()) {
      await createSession();
      await applyFastSettings();
    }
    const s = await windowSize();
    width = s.width;
    height = s.height;
    profile = pickProfile(profiles, width, height);
    if (profile) log(`机型匹配：${width}x${height} 标定档案`);
  } catch (e) {
    log(`取分辨率失败：${e instanceof Error ? e.message : String(e)}`);
  }

  // 无精确档：先试首跑自动标定（本机在干净视频页时能成），失败再用「最接近档」兜底（不再盲取第一个）。
  if (!profile && width > 0) {
    profile = await tryAutoCalibrate(width, height, log);
    if (profile) log(`已自动标定本机型 ${width}x${height} 并记住`);
  }
  if (!profile) {
    const keys = Object.keys(profiles);
    const nk = width > 0 ? nearestProfileKey(keys, width, height) : (keys[0] ?? null);
    if (nk) {
      profile = profiles[nk];
      log(`未找到 ${width}x${height} 标定，用最接近的 ${nk} 兜底（建议对本机 calibrate）`);
    }
  }
  if (!profile) {
    throw new Error("未找到任何标定坐标（devices.json 为空且自动标定失败，请先 calibrate 本机）");
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

  return createOnDeviceUI({ profile, ocr, log, onEvent: track });
}
