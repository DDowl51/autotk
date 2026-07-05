import type { DeviceStatus } from "@mc/shared";

/** 持久化的设备记录（不含 online 这种实时态）。 */
export interface DeviceRecord {
  deviceId: string;
  deviceName: string;
  version?: string;
  lastSeen: number;
  lastProgressAt?: number;
  status?: DeviceStatus;
}

/** 设备存储端口。阶段 1 用内存实现；以后可换 Prisma/Postgres 让设备列表跨重启留存。 */
export interface DeviceStore {
  upsert(r: {
    deviceId: string;
    deviceName: string;
    version?: string;
    lastSeen: number;
  }): Promise<void>;
  setStatus(
    deviceId: string,
    status: DeviceStatus,
    lastSeen: number,
    lastProgressAt: number | undefined,
  ): Promise<void>;
  get(deviceId: string): Promise<DeviceRecord | null>;
  list(): Promise<DeviceRecord[]>;
  remove(deviceId: string): Promise<void>;
}
