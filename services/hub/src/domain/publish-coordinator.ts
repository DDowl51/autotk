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

  constructor(
    private readonly send: SendPublishTask,
    private readonly progress: EmitPublishProgress,
    opts: PublishOpts = {},
  ) {
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.timers = opts.timers ?? realTimers;
  }

  start(task: PublishTask): void {
    const online = this.send(task.deviceId, {
      taskId: task.taskId,
      videoName: task.videoName,
      caption: task.caption,
      source: task.source,
    });
    if (!online) {
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
