// Electron preload 暴露的 master 后台桥。浏览器预览时返回 null。
import type { MasterStatusSnapshot } from "../electron/master-status.cjs";

export interface MasterSettings {
  vlmUrl: string;
  subnet: string;
}

export type MasterStatus = MasterStatusSnapshot;

export interface MasterApi {
  available: boolean;
  getSettings(): Promise<MasterSettings>;
  saveSettings(settings: MasterSettings): Promise<MasterSettings>;
  getStatus(): Promise<MasterStatus>;
  restart(): Promise<MasterStatus>;
  openLogs(): Promise<string>;
  onStatus(listener: (status: MasterStatus) => void): () => void;
}

export function getMasterApi(): MasterApi | null {
  const api = (globalThis as { master?: MasterApi }).master;
  return api?.available ? api : null;
}
