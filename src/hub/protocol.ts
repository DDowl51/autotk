// Vendored from management-center/packages/shared —— 保持同步（事件名/字段需与 Hub 一致）。

export interface DeviceStats {
  likes: number;
  follows: number;
  comments: number;
  videos: number;
}

export interface DeviceStatus {
  running: boolean;
  module?: string; // forYou / kwSearch / persHome
  page?: string; // feed / comments / search / profile
  stats?: DeviceStats;
  alert?: string | null;
  ts: number;
}

export interface DeviceLogMsg {
  level: "info" | "warn" | "error";
  msg: string;
  ts: number;
}

// ——— 阶段2：批量配置下发（与 @mc/shared ConfigPatch 对齐）———

export interface ModuleParamsPatch {
  interactEnable?: boolean;
  interactProb?: number;
  videoLikeProb?: number;
  videoSaveProb?: number;
  videoFollowProb?: number;
  commentLikeProb?: number;
  commentReplyProb?: number;
  commentLikeMaxCount?: number;
  commentReplyMaxCount?: number;
}

/** AutomationParams 的深度可选子集，只携带要改的字段。 */
export interface ConfigPatch {
  searchKeywords?: string[];
  posPrompts?: string[];
  negPrompts?: string[];
  commentMatchKeywords?: string[];
  fixedReplies?: string[];
  kwSearchExecRatio?: number;
  clickWaitTime?: number;
  postReplies?: boolean;
  allDay?: boolean;
  forYou?: ModuleParamsPatch;
  kwSearch?: ModuleParamsPatch;
  persHome?: ModuleParamsPatch & { moduleEnable?: boolean; maxVideoCount?: number };
  taskWindows?: Array<{ start: string; end: string }>;
}

export interface ConfigApplyMsg {
  jobId: string;
  patch: ConfigPatch;
}

export interface ConfigResultMsg {
  jobId: string;
  ok: boolean;
  error?: string;
}

// ——— 阶段3：发布视频（与 @mc/shared 对齐）———

export type PublishSource = { kind: "lan"; url: string } | { kind: "relay"; url: string };

export type PublishStatus =
  | "sent"
  | "downloading"
  | "downloaded"
  | "publishing"
  | "published"
  | "failed"
  | "offline"
  | "timeout";

/** Hub → 手机 的发布任务。 */
export interface PublishTaskMsg {
  taskId: string;
  videoName: string;
  caption: string;
  source: PublishSource;
}

/** 手机 → Hub 的发布状态回报。 */
export interface PublishResultMsg {
  taskId: string;
  status: PublishStatus;
  error?: string;
}

export const EVT = {
  deviceStatus: "device:status",
  deviceLog: "device:log", // 批量 { lines: DeviceLogMsg[] }
  logsWanted: "logs:wanted", // Hub → 手机 { on }
  configApply: "config:apply", // Hub → 手机 { jobId, patch }
  configResult: "config:result", // 手机 → Hub { jobId, ok, error? }
  publishTask: "publish:task", // Hub → 手机 { taskId, videoName, caption, source }
  publishResult: "publish:result", // 手机 → Hub { taskId, status, error? }
} as const;
