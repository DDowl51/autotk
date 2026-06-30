// Vendored from license-saas/packages/sdk/src/storage.ts —— 保持同步。
export interface LicenseStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

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
