import * as Location from "expo-location";
import { requireNativeModule } from "expo-modules-core";

/**
 * 后台保活（原生持续定位，原理同 AScript）。
 *
 * 用 keepalive-native 原生模块的 CLLocationManager 持续后台定位，让 iOS 不挂起进程，
 * RN 引擎得以在后台/锁屏持续运行。
 *
 * 为什么不用 expo-location 的 startLocationUpdatesAsync：那是「后台任务式」——定位来了
 * 才无头唤醒一下，主线程（跑引擎的）仍被挂起，所以会"几十秒就停"。原生持续定位才是解。
 *
 * 需要：app.json 的 UIBackgroundModes 含 "location" + NSLocation* 权限，且授予「始终」定位。
 * 仅在含原生模块的自定义 dev/release build 上可用（Expo Go 不可用）。
 */

export interface KeepAliveResult {
  /** 是否拿到「始终允许」（拿到才真正后台保活）。 */
  always: boolean;
}

interface KeepAliveNative {
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** 取原生保活模块（未链上时抛错，由调用方处理）。 */
function native(): KeepAliveNative {
  return requireNativeModule("KeepAlive") as KeepAliveNative;
}

/**
 * 启动保活。
 * - 前台定位被彻底拒绝 → 抛错（调用方提示去设置开定位）。
 * - 只拿到「使用App时」→ 返回 {always:false}，由调用方提示用户改「始终」。
 * - 拿到「始终」→ 启动原生持续定位保活，返回 {always:true}。
 */
export async function startKeepAlive(): Promise<KeepAliveResult> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") {
    throw new Error("定位权限被拒。请到 设置→隐私与安全性→定位服务→autotk 打开定位");
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") {
    return { always: false };
  }
  await native().start();
  return { always: true };
}

/** 停止保活。 */
export async function stopKeepAlive(): Promise<void> {
  try {
    await native().stop();
  } catch {
    /* 未链上原生模块时忽略 */
  }
}
