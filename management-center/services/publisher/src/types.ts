// 操作员侧「文件夹工作流」的数据结构。
// 根目录下每个子文件夹名 = 设备名，里面放当天要发的视频。

/** 扫描到的一个视频文件。 */
export interface VideoItem {
  deviceName: string; // 子文件夹名
  fileName: string; // 含扩展名
  absPath: string;
  size: number; // 字节
  mtimeMs: number;
}

/** 排程后的待发项（已分配发布时间 + 文案）。 */
export interface PublishPlanItem extends VideoItem {
  caption: string;
  scheduledAt: number; // 绝对时间（ms）
}

/** 已发布清单（每设备一份 .published.json）：key=文件指纹 → 发布时间(ms)。 */
export interface Manifest {
  published: Record<string, number>;
}

export const VIDEO_EXTS = [".mp4", ".mov", ".m4v"] as const;
