// 一条事件。props 由各系统按需填（约定不放 PII）。
export interface TelemetryEvent {
  name: string;
  props?: Record<string, unknown>;
  ts: number; // 产生时间（ms）
}

// 上报给采集服务的批量载荷。
export interface IngestPayload {
  system: string; // "autotk" | "management-center" | "license-server"
  anonId: string; // 匿名安装 id（持久）
  sessionId: string; // 本次会话 id
  appVersion?: string;
  events: TelemetryEvent[];
  sentAt: number;
}

// 可注入存储（持久化匿名 id；RN 注入 expo-secure-store / AsyncStorage，浏览器注入 localStorage 适配）。
export interface TelemetryStorage {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
}

export interface MinimalResponse {
  ok: boolean;
  status: number;
}
export type FetchLike = (url: string, init: unknown) => Promise<MinimalResponse>;
