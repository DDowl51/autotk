import { requireNativeModule } from "expo-modules-core";

const Native = requireNativeModule("KeepAlive");

/** 开启原生持续后台定位保活（仅含本原生模块的 dev/release build 可用；Expo Go 不可用）。 */
export function start(): Promise<void> {
  return Native.start();
}

/** 停止保活。 */
export function stop(): Promise<void> {
  return Native.stop();
}
