import * as Device from "expo-device";

/** 可读设备名：优先 iOS 设备名（如"张三的 iPhone"），退回型号。唯一性靠 deviceId。 */
export function resolveDeviceName(): string {
  return (Device.deviceName || Device.modelName || "autotk 设备").toString();
}

/**
 * 唯一化设备名：默认 iOS 设备名多台会重名——未改名的 iPhone 出厂名都叫 "iPhone"。
 * 而管理中心的发布是按「设备名＝文件夹名」匹配的，重名会让视频**只发到其中一台、其余静默漏发**。
 * 故给上报名追加设备号短尾（deviceId 末 4 位），出厂即唯一；买家想要好记的名字可在管理中心改名。
 */
export function uniqueDeviceName(base: string, deviceId: string): string {
  const tail = (deviceId || "").replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase();
  return tail ? `${base}-${tail}` : base;
}
