import * as SecureStore from "expo-secure-store";
import type { LicenseStorage } from "./sdk";

// SecureStore key 仅允许 字母数字 . - _ —— 把其它字符（如 license:key 的冒号）替换掉。
const sanitize = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, "_");

/** 用 iOS Keychain / Android Keystore 安全存储 license token。IO 失败不上抛崩，降级处理。 */
export const secureStorage: LicenseStorage = {
  async get(key) {
    try {
      return await SecureStore.getItemAsync(sanitize(key));
    } catch {
      return null; // 读不到当未激活处理
    }
  },
  async set(key, value) {
    try {
      await SecureStore.setItemAsync(sanitize(key), value);
    } catch {
      /* 存不进不崩：大不了下次重新激活 */
    }
  },
  async del(key) {
    try {
      await SecureStore.deleteItemAsync(sanitize(key));
    } catch {
      /* ignore */
    }
  },
};
