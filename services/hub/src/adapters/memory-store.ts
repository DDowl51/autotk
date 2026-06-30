import type { DeviceStatus } from "@mc/shared";
import type { DeviceRecord, DeviceStore } from "../domain/ports";

/** 内存版 DeviceStore（阶段 1）。重启即丢；以后换 Prisma/Postgres 留存。 */
export class MemoryDeviceStore implements DeviceStore {
  private readonly m = new Map<string, DeviceRecord>();

  async upsert(r: {
    deviceId: string;
    deviceName: string;
    version?: string;
    lastSeen: number;
  }): Promise<void> {
    const cur = this.m.get(r.deviceId);
    this.m.set(r.deviceId, {
      deviceId: r.deviceId,
      deviceName: r.deviceName,
      version: r.version,
      lastSeen: r.lastSeen,
      status: cur?.status,
    });
  }

  async setStatus(
    deviceId: string,
    status: DeviceStatus,
    lastSeen: number,
    lastProgressAt: number | undefined,
  ): Promise<void> {
    const cur = this.m.get(deviceId);
    if (cur) this.m.set(deviceId, { ...cur, status, lastSeen, lastProgressAt });
  }

  async get(deviceId: string): Promise<DeviceRecord | null> {
    return this.m.get(deviceId) ?? null;
  }

  async list(): Promise<DeviceRecord[]> {
    return [...this.m.values()];
  }
}
