import * as Device from "expo-device";

/** 可读设备名：优先 iOS 设备名（如"张三的 iPhone"），退回型号。唯一性靠 deviceId。 */
export function resolveDeviceName(): string {
  return (Device.deviceName || Device.modelName || "autotk 设备").toString();
}
