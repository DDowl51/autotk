/** token 持久化适配器。RN 用 SecureStore/Keychain、浏览器用 localStorage、测试用内存。 */
export interface LicenseStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

/** 默认内存实现（进程内有效；生产请注入持久化实现）。 */
export class MemoryStorage implements LicenseStorage {
  private readonly m = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.m.has(key) ? (this.m.get(key) as string) : null;
  }
  async set(key: string, value: string): Promise<void> {
    this.m.set(key, value);
  }
  async del(key: string): Promise<void> {
    this.m.delete(key);
  }
}
