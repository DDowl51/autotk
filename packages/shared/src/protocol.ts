// Hub ↔ 手机 / Hub ↔ Electron 的实时协议（socket.io 事件 + 消息体）。

/** 设备电量（level 0~100 百分比；charging 是否接着电）。读不到则整个字段省略。 */
export interface DeviceBattery {
  level: number;
  charging: boolean;
}

/** 手机上报的运行状态。 */
export interface DeviceStatus {
  running: boolean;
  module?: string; // 当前模块：forYou / kwSearch / persHome
  page?: string; // 当前页面
  stats?: {
    likes: number;
    follows: number;
    comments: number;
    videos: number;
  };
  alert?: string | null; // 告警文字（脱困失败/卡死等），null=无
  battery?: DeviceBattery; // 当前电量，读不到则省略
  ts: number; // 上报时间（ms）
}

/** 看板里一台设备的完整信息。 */
export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  version?: string;
  online: boolean;
  lastSeen: number;
  /** 最近一次"有进展"（统计数变化）的时间，Hub 计算，用于「疑似卡住」判定。 */
  lastProgressAt?: number;
  status?: DeviceStatus;
}

// 代码名 → 中文（手机/Hub/桌面共用，避免各写各的）。
export const MODULE_LABELS: Record<string, string> = {
  forYou: "推荐页",
  kwSearch: "关键词搜索",
  persHome: "个人主页",
};
export const PAGE_LABELS: Record<string, string> = {
  feed: "推荐流",
  comments: "评论区",
  search: "搜索结果",
  profile: "个人主页",
};
export function moduleLabel(m?: string): string {
  return m ? (MODULE_LABELS[m] ?? m) : "—";
}
export function pageLabel(p?: string): string {
  return p ? (PAGE_LABELS[p] ?? p) : "—";
}

/** 手机注册消息。 */
export interface DeviceRegisterMsg {
  deviceId: string;
  deviceName: string;
  version?: string;
}

/** 一条手机日志（合并相邻重复后 msg 里会带 "×N"）。 */
export interface DeviceLogMsg {
  level: "info" | "warn" | "error";
  msg: string;
  ts: number; // 产生时间（ms）
}

/** 手机批量上报日志的消息体（device:log）。 */
export interface DeviceLogBatch {
  lines: DeviceLogMsg[];
}

/** Hub → 操作员 的日志推送（device:logs）。replace=true 表示这是开始查看时的全量快照。 */
export interface DeviceLogsMsg {
  deviceId: string;
  lines: DeviceLogMsg[];
  replace?: boolean;
}

/** 操作员 → Hub 订阅/取消订阅某台日志（logs:watch）。 */
export interface WatchLogsMsg {
  deviceId: string;
  on: boolean;
}

// ——— 阶段2：批量配置下发 ———

/** 单个互动模块可批量下发的参数（与 autotk ModuleInteractionParams 对齐，全部可选=只改填了的）。 */
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

/**
 * 批量下发的配置补丁：AutomationParams 的「深度可选」子集。
 * 只携带要改的字段；手机端深合并进现有参数并校验后生效。
 * 结构与 autotk AutomationParams 保持一致（两端共用，避免漂移）。
 */
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
  /** 关注监控（打粉）：moduleEnable 与日常养号互斥；关键词/话术留空则沿用全局。 */
  following?: ModuleParamsPatch & {
    moduleEnable?: boolean;
    commentMatchKeywords?: string[];
    fixedReplies?: string[];
  };
  taskWindows?: Array<{ start: string; end: string }>;
}

/** 一台设备在某次下发任务里的状态。 */
export type ConfigJobStatus = "sent" | "ok" | "failed" | "offline" | "timeout";

export interface ConfigPushMsg {
  jobId: string;
  deviceIds: string[];
  patch: ConfigPatch;
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
export interface ConfigProgressMsg {
  jobId: string;
  deviceId: string;
  status: ConfigJobStatus;
  error?: string;
}

// ——— 阶段3：文件夹工作流·发布视频 ———

/** 视频来源：同网=操作员本机 LAN 直链；跨网=Hub 中转链。 */
export type PublishSource = { kind: "lan"; url: string } | { kind: "relay"; url: string };

/** 一条发布任务：把某个视频发到某台手机的 TikTok。 */
export interface PublishTask {
  taskId: string;
  deviceId: string;
  videoName: string;
  caption: string;
  source: PublishSource;
  /**
   * 定时发送的目标时刻（epoch ms）。缺省/过去 = 立即下发；
   * 未来 = Hub 持有到点再下发（手机侧无需改动，收到即发）。
   */
  scheduledAtMs?: number;
}

/**
 * 发布状态机：scheduled（Hub 待发）→ sent→downloading→downloaded→publishing→published；
 * 或 failed/offline/timeout。scheduled 是 Hub 侧「已排期未下发」的中间态，手机不产生。
 */
export type PublishStatus =
  | "scheduled"
  | "sent"
  | "downloading"
  | "downloaded"
  | "publishing"
  | "published"
  | "failed"
  | "offline"
  | "timeout";

/** published/failed/offline/timeout 为终态。 */
export const PUBLISH_TERMINAL: readonly PublishStatus[] = ["published", "failed", "offline", "timeout"];
export const isPublishTerminal = (s: PublishStatus): boolean => PUBLISH_TERMINAL.includes(s);

export type PublishEnqueueMsg = PublishTask; // 操作员 → Hub
export interface PublishTaskMsg {
  taskId: string;
  videoName: string;
  caption: string;
  source: PublishSource;
} // Hub → 手机（设备由房间隐含）
export interface PublishResultMsg {
  taskId: string;
  status: PublishStatus;
  error?: string;
} // 手机 → Hub
export interface PublishProgressMsg {
  taskId: string;
  deviceId: string;
  status: PublishStatus;
  error?: string;
} // Hub → 操作员

/** socket.io 事件名（集中定义，避免拼错）。 */
export const EVT = {
  // 手机 → Hub
  deviceRegister: "device:register",
  deviceStatus: "device:status",
  deviceLog: "device:log", // 批量日志 { lines: DeviceLogMsg[] }
  // Hub → 手机
  logsWanted: "logs:wanted", // 是否有人在看本机日志 { on } —— 手机据此切上报频率
  // Hub → Electron（操作员）
  devicesSnapshot: "devices:snapshot", // 连上时给全量
  deviceUpdate: "device:update", // 单台变化（上线/下线/状态）
  deviceLogs: "device:logs", // 某台的日志推送 { deviceId, lines, replace? }
  configProgress: "config:progress", // 批量下发逐台进度 { jobId, deviceId, status, error? }
  publishProgress: "publish:progress", // 发布逐步进度 { taskId, deviceId, status, error? }
  // Hub → 手机
  configApply: "config:apply", // 下发配置补丁 { jobId, patch }
  publishTask: "publish:task", // 发布任务 { taskId, videoName, caption, source }
  // 手机 → Hub
  configResult: "config:result", // 应用结果 { jobId, ok, error? }
  publishResult: "publish:result", // 发布状态回报 { taskId, status, error? }
  // Electron → Hub
  operatorHello: "operator:hello",
  watchLogs: "logs:watch", // 订阅/取消订阅某台日志 { deviceId, on }
  configPush: "config:push", // 批量下发配置 { jobId, deviceIds, patch }
  publishEnqueue: "publish:enqueue", // 发起发布任务 { taskId, deviceId, videoName, caption, source }
  deviceRename: "device:rename", // 给设备改名（别名） { deviceId, alias }
} as const;

/** 操作员给设备改名。alias 为空串=清除别名、恢复上报名。 */
export interface DeviceRenameMsg {
  deviceId: string;
  alias: string;
}

/** socket.io handshake 里区分连的是手机还是操作员。 */
export type ClientRole = "device" | "operator";
