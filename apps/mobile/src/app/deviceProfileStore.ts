import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DeviceProfile } from "../engine/onDeviceUI";

// 端上标定档持久化：出厂 devices.json（打包只读）之外，把「首跑自动标定/买家本机标定」的结果
// 存到 AsyncStorage，realUI 启动时与出厂档合并。键=逻辑分辨率 WxH。
const KEY = "autotk.device_profiles";

export async function getStoredProfiles(): Promise<Record<string, DeviceProfile>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, DeviceProfile>) : {};
  } catch {
    return {};
  }
}

export async function saveStoredProfile(key: string, prof: DeviceProfile): Promise<void> {
  try {
    const all = await getStoredProfiles();
    all[key] = prof;
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* 存储失败不影响本次运行 */
  }
}
