import type { DeviceLogMsg } from "@mc/shared";

/**
 * 每台设备一个环形日志缓冲（最近 cap 条）+ 「谁在看哪台」的 watcher 集合。
 * 纯类、不碰 socket.io —— gateway 调用本类并据返回值决定转发/切频率，便于单测。
 *
 * watcher 用操作员的 socket.id 标识；一台可被多个操作员同时看。
 * 「首个 watcher 出现 / 最后一个 watcher 离开」用来通知手机切上报频率（logs:wanted）。
 */
export class LogHub {
  private readonly buffers = new Map<string, DeviceLogMsg[]>();
  private readonly watchers = new Map<string, Set<string>>();

  constructor(private readonly cap = 500) {}

  /** 追加日志（超 cap 丢最旧）。返回实际追加的行，供转发给 watcher。 */
  append(deviceId: string, lines: DeviceLogMsg[]): DeviceLogMsg[] {
    if (!lines || lines.length === 0) return [];
    const buf = this.buffers.get(deviceId) ?? [];
    buf.push(...lines);
    if (buf.length > this.cap) buf.splice(0, buf.length - this.cap);
    this.buffers.set(deviceId, buf);
    return lines;
  }

  /** 某台当前缓冲的全量快照（操作员开始查看时下发）。 */
  snapshot(deviceId: string): DeviceLogMsg[] {
    return [...(this.buffers.get(deviceId) ?? [])];
  }

  /** watcher 开始看某台；返回是否是该台的「首个」watcher（首个→通知手机切快频）。 */
  addWatcher(deviceId: string, watcherId: string): boolean {
    const set = this.watchers.get(deviceId) ?? new Set<string>();
    const wasEmpty = set.size === 0;
    set.add(watcherId);
    this.watchers.set(deviceId, set);
    return wasEmpty;
  }

  /** watcher 取消看某台；返回该台是否已「无人查看」（→通知手机切慢频）。 */
  removeWatcher(deviceId: string, watcherId: string): boolean {
    const set = this.watchers.get(deviceId);
    if (!set || !set.delete(watcherId)) return false;
    if (set.size === 0) {
      this.watchers.delete(deviceId);
      return true;
    }
    return false;
  }

  /** watcher 断开：清掉它对所有设备的关注，返回因此「无人查看」的设备列表。 */
  removeWatcherEverywhere(watcherId: string): string[] {
    const emptied: string[] = [];
    for (const [deviceId, set] of this.watchers) {
      if (set.delete(watcherId) && set.size === 0) emptied.push(deviceId);
    }
    for (const id of emptied) this.watchers.delete(id);
    return emptied;
  }

  /** 正在看某台的 watcher id 列表（供转发）。 */
  watchersOf(deviceId: string): string[] {
    return [...(this.watchers.get(deviceId) ?? [])];
  }

  isWatched(deviceId: string): boolean {
    return (this.watchers.get(deviceId)?.size ?? 0) > 0;
  }
}
