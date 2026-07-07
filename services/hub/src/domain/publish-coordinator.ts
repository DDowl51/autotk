import {
  isPublishTerminal,
  type PublishTask,
  type PublishTaskMsg,
  type PublishStatus,
  type PublishProgressMsg,
} from "@mc/shared";
import type { Timers } from "./config-dispatcher";

/** 把任务发给某台设备；返回是否在线（送达）。 */
export type SendPublishTask = (deviceId: string, task: PublishTaskMsg) => boolean;
export type EmitPublishProgress = (p: PublishProgressMsg) => void;

const realTimers: Timers = {
  set(fn, ms) {
    const h = setTimeout(fn, ms);
    return () => clearTimeout(h);
  },
};

export interface PublishOpts {
  timeoutMs?: number; // 多久没有任何进展就判 timeout（下载/发布耗时，默认 120s）
  timers?: Timers;
  now?: () => number; // 当前时刻（注入便于测试定时发送）
  /** 排程一条未来定时任务时回调（落盘，供 Hub 重启后重新排程）。 */
  persistScheduled?: (task: PublishTask) => void;
  /** 定时任务到点下发（或取消）时回调（出「定时」持久化）。 */
  dropScheduled?: (taskId: string) => void;
}

/**
 * 发布任务协调器：把任务下发到在线设备、转发手机回报的逐步状态给操作员、长时间无进展则超时。
 * 不碰 socket.io —— 通过注入 send/progress 交互，便于纯单测。
 *
 * 一条 taskId = 一台设备一条视频。状态机：
 *   在线 → sent →（手机回报）downloading/downloaded/publishing → published（终态）
 *              ↘ failed（终态） ↘ 长时间无回报 → timeout（终态）
 *   离线 → offline（终态，不下发）
 * 中间态(downloading 等)会重置超时计时（只要有进展就不算卡）。
 */
export class PublishCoordinator {
  private readonly pending = new Map<string, { deviceId: string; cancel: () => void }>();
  private readonly timeoutMs: number;
  private readonly timers: Timers;
  private readonly now: () => number;
  private readonly persistScheduled?: (task: PublishTask) => void;
  private readonly dropScheduled?: (taskId: string) => void;

  constructor(
    private readonly send: SendPublishTask,
    private readonly progress: EmitPublishProgress,
    opts: PublishOpts = {},
  ) {
    // 无进展超时默认 5 分钟（与手机端引擎单批超时同量级）：给慢网大视频下载/上传留足头寸，
    // 又能兜住真卡死。批量串行发布的误判由 onResult 里「同设备任一进展即重排其余」根治，不靠调大此值。
    this.timeoutMs = opts.timeoutMs ?? 300_000;
    this.timers = opts.timers ?? realTimers;
    this.now = opts.now ?? Date.now;
    this.persistScheduled = opts.persistScheduled;
    this.dropScheduled = opts.dropScheduled;
  }

  start(task: PublishTask): void {
    const at = task.scheduledAtMs;
    if (at != null && at > this.now()) {
      // 定时：先报「待发」并占位，到点再真正下发。手机侧无感知（收到即发）。
      // 落盘持久化，Hub（内嵌桌面 App）重启后可 list() 出来重新排程，定时发布不丢。
      this.emit(task.taskId, task.deviceId, "scheduled");
      this.persistScheduled?.(task);
      const cancel = this.timers.set(() => this.dispatch(task), at - this.now());
      this.pending.set(task.taskId, { deviceId: task.deviceId, cancel });
      return;
    }
    this.dispatch(task);
  }

  /** 立即把任务下发到设备并装上「无进展超时」；离线则终态 offline。 */
  private dispatch(task: PublishTask): void {
    // 一旦真正下发即出「定时」持久化——无论是到点定时器触发，还是 Hub 重启后对**过点**任务
    // 的重排（走此路径而非定时分支）。否则过点任务永留 scheduled.json、每次重启重复下发同一视频。
    this.dropScheduled?.(task.taskId);
    const online = this.send(task.deviceId, {
      taskId: task.taskId,
      videoName: task.videoName,
      caption: task.caption,
      source: task.source,
    });
    if (!online) {
      this.pending.delete(task.taskId); // 清掉可能存在的「待发」占位
      this.progress({ taskId: task.taskId, deviceId: task.deviceId, status: "offline" });
      return;
    }
    this.emit(task.taskId, task.deviceId, "sent");
    this.arm(task.taskId, task.deviceId);
  }

  /** 手机回报状态。未知 taskId 忽略。 */
  onResult(taskId: string, status: PublishStatus, error?: string): void {
    const e = this.pending.get(taskId);
    if (!e) return;
    e.cancel();
    this.emit(taskId, e.deviceId, status, error);
    if (isPublishTerminal(status)) {
      this.pending.delete(taskId);
    } else {
      this.arm(taskId, e.deviceId); // 有进展 → 重置超时
    }
    // 手机对同一设备是**串行**发布：任一任务有进展 = 该设备活着、终会轮到其余排队任务。
    // 故把同设备其余在途任务的「无进展超时」一并重排，否则批量「全部发布」时排在后面、
    // 尚未开始的任务会在漫长等待中被误判 timeout 删除；之后手机真回报又因 taskId 未知被丢弃，
    // 桌面永远卡「超时·可重试」。（跨设备互不影响，只重排同一 deviceId 的。）
    this.rearmDevice(e.deviceId, taskId);
  }

  /** 重排某设备除 exceptTaskId 外所有在途任务的无进展超时（该任务刚在上面单独处理过）。 */
  private rearmDevice(deviceId: string, exceptTaskId: string): void {
    const ids: string[] = [];
    for (const [tid, entry] of this.pending) {
      if (tid !== exceptTaskId && entry.deviceId === deviceId) ids.push(tid);
    }
    for (const tid of ids) {
      const entry = this.pending.get(tid);
      if (!entry) continue;
      entry.cancel();
      this.arm(tid, deviceId);
    }
  }

  pendingCount(): number {
    return this.pending.size;
  }

  private emit(taskId: string, deviceId: string, status: PublishStatus, error?: string): void {
    this.progress({ taskId, deviceId, status, error });
  }

  private arm(taskId: string, deviceId: string): void {
    const cancel = this.timers.set(() => {
      if (this.pending.delete(taskId)) this.emit(taskId, deviceId, "timeout");
    }, this.timeoutMs);
    this.pending.set(taskId, { deviceId, cancel });
  }
}
