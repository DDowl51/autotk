import type { DeviceInfo, DeviceRegisterMsg, DeviceStatus } from "@mc/shared";
import type { DeviceRecord, DeviceStore } from "./ports";
import type { AliasStore } from "./alias-store";

type Stats = NonNullable<DeviceStatus["stats"]>;

/** 是否"有进展"：统计数任一增长。 */
export function statsProgressed(prev: Stats | undefined, next: Stats | undefined): boolean {
  if (!next) return false;
  if (!prev) return true;
  return (
    next.likes !== prev.likes ||
    next.follows !== prev.follows ||
    next.comments !== prev.comments ||
    next.videos !== prev.videos
  );
}

/**
 * 设备注册表：维护「在线集合」（实时，基于连接）+ 通过 DeviceStore 持久化设备身份与最近状态。
 * 不碰 socket.io —— gateway 调用本类并把返回的 DeviceInfo 广播给操作员，便于纯单测。
 */
export class DeviceRegistry {
  // deviceId → 当前拥有「在线」态的 socketId。用 Map（非 Set）以便区分「哪个 socket 在线」，
  // 避免旧 socket 的迟到 disconnect 把已用新 socket 重连的设备误标离线（幽灵下线）。
  private readonly online = new Map<string, string>();

  constructor(
    private readonly store: DeviceStore,
    private readonly now: () => number = Date.now,
    private readonly alias?: AliasStore,
  ) {}

  private toInfo(r: DeviceRecord): DeviceInfo {
    return {
      deviceId: r.deviceId,
      // 有别名则用别名作为「当前名」（设备列表/发布文件夹都跟这个走）。
      deviceName: this.alias?.get(r.deviceId) ?? r.deviceName,
      version: r.version,
      online: this.online.has(r.deviceId),
      lastSeen: r.lastSeen,
      lastProgressAt: r.lastProgressAt,
      status: r.status,
    };
  }

  /** 给设备改名（别名，空串=清除）。返回更新后的 DeviceInfo（设备未知则 null，但别名仍记下）。 */
  async rename(deviceId: string, alias: string): Promise<DeviceInfo | null> {
    await this.alias?.set(deviceId, alias);
    const r = await this.store.get(deviceId);
    return r ? this.toInfo(r) : null;
  }

  /** 删除设备（操作员手动移除）：清在线态 + 别名 + 存储。 */
  async remove(deviceId: string): Promise<void> {
    this.online.delete(deviceId);
    await this.alias?.set(deviceId, ""); // 空串=清别名
    await this.store.remove(deviceId);
  }

  /** 手机连上并注册：记住这条 socket 拥有在线态 + 落库，返回最新 DeviceInfo（供广播）。 */
  async register(msg: DeviceRegisterMsg, socketId: string): Promise<DeviceInfo> {
    this.online.set(msg.deviceId, socketId);
    await this.store.upsert({
      deviceId: msg.deviceId,
      deviceName: msg.deviceName,
      version: msg.version,
      lastSeen: this.now(),
    });
    const r = await this.store.get(msg.deviceId);
    return this.toInfo(r as DeviceRecord);
  }

  /** 手机上报状态。未注册的先忽略（返回 null）。 */
  async updateStatus(deviceId: string, status: DeviceStatus): Promise<DeviceInfo | null> {
    const existing = await this.store.get(deviceId);
    if (!existing) return null;
    const now = this.now();
    const progressed = statsProgressed(existing.status?.stats, status.stats);
    const lastProgressAt = progressed ? now : existing.lastProgressAt;
    await this.store.setStatus(deviceId, status, now, lastProgressAt);
    const r = await this.store.get(deviceId);
    return this.toInfo(r as DeviceRecord);
  }

  /**
   * 手机断开：**仅当断开的正是当前在线 socket** 才标离线（仍保留在列表里）。
   * 旧 socket 的迟到 disconnect（设备已用新 socket 重连）→ owner 已不是它 → 忽略、返回 null
   * 不广播离线，避免幽灵下线导致后续下发/发布被静默丢弃。
   */
  async disconnect(deviceId: string, socketId: string): Promise<DeviceInfo | null> {
    if (this.online.get(deviceId) !== socketId) return null; // 陈旧断开：设备已重连，忽略
    this.online.delete(deviceId);
    const r = await this.store.get(deviceId);
    return r ? this.toInfo(r) : null;
  }

  /** 全量快照（给操作员连上时）。 */
  async snapshot(): Promise<DeviceInfo[]> {
    const all = await this.store.list();
    return all.map((r) => this.toInfo(r));
  }

  isOnline(deviceId: string): boolean {
    return this.online.has(deviceId);
  }
}
