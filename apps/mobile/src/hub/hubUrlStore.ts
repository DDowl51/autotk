import AsyncStorage from "@react-native-async-storage/async-storage";

// 持久化「控制中心地址」：扫码/自动发现连上一次后记住，重启 App 免再配。
const KEY = "autotk.hub_url";

export async function getStoredHubUrl(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function setStoredHubUrl(url: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, url);
  } catch {
    /* 存储失败不影响连接 */
  }
}

export async function clearStoredHubUrl(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
