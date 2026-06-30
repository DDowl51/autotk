import * as SecureStore from "expo-secure-store";
import type { LicenseStorage } from "./sdk";

// SecureStore key 仅允许 字母数字 . - _ —— 把其它字符（如 license:key 的冒号）替换掉。
const sanitize = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, "_");

/** 用 iOS Keychain / Android Keystore 安全存储 license token。 */
export const secureStorage: LicenseStorage = {
  async get(key) {
    return SecureStore.getItemAsync(sanitize(key));
  },
  async set(key, value) {
    await SecureStore.setItemAsync(sanitize(key), value);
  },
  async del(key) {
    await SecureStore.deleteItemAsync(sanitize(key));
  },
};
