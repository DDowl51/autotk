import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

/**
 * 后台保活（原版同款 trick）。
 *
 * 原理:申请「始终允许」定位 + 开启后台定位更新,iOS 就不会挂起 App,
 * JS 引擎可在锁屏/后台持续驱动 WDA。任务体留空——目的只是让系统因后台定位而保活。
 *
 * 需要:app.json 里 UIBackgroundModes:["location"] + NSLocation* 权限 + expo-location 插件,
 * 且必须是自定义 dev/release build(Expo Go 提供不了后台定位)。
 *
 * iOS 的「始终」是两步授权:先「使用App时」,再升级「始终」。只有拿到「始终」
 * 才能真正后台保活;只有「使用App时」时,后台会被挂起,需用户到设置里改「始终」。
 */
const TASK = "autotk-keepalive";

TaskManager.defineTask(TASK, async () => {
  // 空任务体:不需要真正处理位置,仅借后台定位让 App 保持存活。
});

export interface KeepAliveResult {
  /** 是否拿到「始终允许」（拿到才真正后台保活）。 */
  always: boolean;
}

/**
 * 启动保活。
 * - 前台定位被彻底拒绝 → 抛错（调用方提示去设置开定位）。
 * - 拿到「始终」→ 开启后台定位更新,返回 {always:true}。
 * - 只拿到「使用App时」→ 不开后台更新（iOS 会拒）,返回 {always:false},
 *   由调用方提示用户到 设置→隐私→定位服务→autotk 改为「始终」。
 */
export async function startKeepAlive(): Promise<KeepAliveResult> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") {
    throw new Error("定位权限被拒。请到 设置→隐私与安全性→定位服务→autotk 打开定位");
  }

  // 这一步会弹出「升级为始终允许」的系统框（前台已授权时）。
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") {
    return { always: false };
  }

  if (!(await Location.hasStartedLocationUpdatesAsync(TASK))) {
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.Lowest,
      deferredUpdatesInterval: 60000,
      showsBackgroundLocationIndicator: false,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.Other,
    });
  }
  return { always: true };
}

/** 停止保活。 */
export async function stopKeepAlive(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(TASK)) {
    await Location.stopLocationUpdatesAsync(TASK);
  }
}
