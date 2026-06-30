import * as Application from "expo-application";
import { LicenseClient } from "./sdk";
import { LICENSE_CONFIG } from "./config";
import { secureStorage } from "./secureStorage";
import { resolveDeviceId } from "./deviceId";

/** 构建配置好的 LicenseClient（SecureStore 存储 + 设备标识）。 */
export async function createLicenseClient(): Promise<LicenseClient> {
  const deviceId = await resolveDeviceId();
  return new LicenseClient({
    baseUrl: LICENSE_CONFIG.baseUrl,
    productKey: LICENSE_CONFIG.productKey,
    productSecret: LICENSE_CONFIG.productSecret,
    deviceId,
    storage: secureStorage,
    storageKey: "license_token", // SecureStore 友好（无冒号）
  });
}

/** 给服务端看的设备别名（设备名），便于在管理后台辨识。 */
export function deviceName(): string {
  return Application.nativeApplicationVersion
    ? `autotk ${Application.nativeApplicationVersion}`
    : "autotk";
}
