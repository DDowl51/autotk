import * as Application from "expo-application";
import * as SecureStore from "expo-secure-store";

const FALLBACK_KEY = "license_device_id_fallback";

function randomId(): string {
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * 设备稳定标识：优先 iOS identifierForVendor；取不到则用持久化随机 ID 兜底
 * （存 Keychain，重装/重启仍稳定，除非用户主动清除）。
 */
export async function resolveDeviceId(): Promise<string> {
  try {
    const idfv = await Application.getIosIdForVendoringAsync();
    if (idfv) return idfv;
  } catch {
    // 忽略，走兜底
  }
  let v = await SecureStore.getItemAsync(FALLBACK_KEY);
  if (!v) {
    v = randomId();
    await SecureStore.setItemAsync(FALLBACK_KEY, v);
  }
  return v;
}
