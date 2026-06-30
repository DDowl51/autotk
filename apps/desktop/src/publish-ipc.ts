// 渲染层 ↔ Electron 主进程 的发布 IPC 契约。
// 主进程持有文件系统 + 局域网服务（用 @mc/publisher），渲染层只通过 window.publisher 调用。
// 这里的类型与 @mc/publisher 对应结构保持一致（渲染层不能直接 import 该 node 包）。

export interface ScheduleInput {
  allDay: boolean;
  taskWindows: Array<{ start: string; end: string }>;
  jitterSec?: number;
}

export interface PublishPlanItem {
  deviceName: string;
  fileName: string;
  absPath: string;
  size: number;
  mtimeMs: number;
  caption: string;
  scheduledAt: number;
}

export interface DevicePlan {
  deviceName: string;
  pending: PublishPlanItem[];
  publishedCount: number;
}

export interface PublishSource {
  kind: "lan" | "relay";
  url: string;
}

export interface PublisherApi {
  available: true;
  chooseRoot(): Promise<string | null>;
  refresh(opts: { rootDir: string; schedule: ScheduleInput }): Promise<DevicePlan[]>;
  prepareSource(args: {
    deviceName: string;
    fileName: string;
    mode: "lan" | "relay";
    hubBase?: string;
  }): Promise<PublishSource>;
  markPublished(args: { deviceName: string; fileName: string }): Promise<void>;
  /** 设备改名时同步把视频子文件夹一起改名。 */
  renameFolder(args: { oldName: string; newName: string }): Promise<void>;
}

/** 取主进程注入的 publisher 桥；非 Electron（纯浏览器/dev）下为 null。 */
export function getPublisherApi(): PublisherApi | null {
  const api = (globalThis as { publisher?: PublisherApi }).publisher;
  return api?.available ? api : null;
}
