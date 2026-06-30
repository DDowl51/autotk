import type { ConfigPatch, ConfigProgressMsg } from "@mc/shared";

/** 把配置补丁发给某台设备；返回是否在线（送达）。 */
export type SendApply = (deviceId: string, jobId: string, patch: ConfigPatch) => boolean;
/** 把逐台进度回报给操作员。 */
export type EmitProgress = (p: ConfigProgressMsg) => void;

/** 可注入的定时器（便于单测用假时钟）。set 返回取消函数。 */
export interface Timers {
  set(fn: () => void, ms: number): () => void;
}

const realTimers: Timers = {
  set(fn, ms) {
    const h = setTimeout(fn, ms);
    return () => clearTimeout(h);
  },
};

export interface DispatcherOpts {
  timeoutMs?: number;
  timers?: Timers;
}

/**
 * 批量配置下发的协调器：建任务、向在线设备下发、跟踪逐台结果、超时兜底。
 * 不碰 socket.io —— 通过注入的 send/progress 与外界交互，便于纯单测。
 *
 * 逐台状态流转：
 *   在线 → sent →（手机回 config:result）→ ok / failed
 *                  ↘（timeoutMs 内没回）→ timeout
 *   离线 → offline（不下发、不等待）
 */
export class ConfigDispatcher {
  // jobId → (deviceId → 取消该台超时的函数)，仅保留「仍在等待」的台。
  private readonly pending = new Map<string, Map<string, () => void>>();

  constructor(
    private readonly send: SendApply,
    private readonly progress: EmitProgress,
    opts: DispatcherOpts = {},
  ) {
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.timers = opts.timers ?? realTimers;
  }

  private readonly timeoutMs: number;
  private readonly timers: Timers;

  /** 发起一次下发。deviceIds 去重；离线台直接 offline。 */
  start(jobId: string, deviceIds: string[], patch: ConfigPatch): void {
    const perDevice = new Map<string, () => void>();
    this.pending.set(jobId, perDevice);

    for (const deviceId of new Set(deviceIds)) {
      const online = this.send(deviceId, jobId, patch);
      if (!online) {
        this.progress({ jobId, deviceId, status: "offline" });
        continue;
      }
      this.progress({ jobId, deviceId, status: "sent" });
      const cancel = this.timers.set(() => {
        if (perDevice.delete(deviceId)) {
          this.progress({ jobId, deviceId, status: "timeout" });
          this.cleanup(jobId);
        }
      }, this.timeoutMs);
      perDevice.set(deviceId, cancel);
    }
    this.cleanup(jobId); // 全部离线时立刻清理
  }

  /** 手机回执。未知/已结算的（jobId+deviceId 不在等待集）忽略。 */
  onResult(jobId: string, deviceId: string, ok: boolean, error?: string): void {
    const perDevice = this.pending.get(jobId);
    const cancel = perDevice?.get(deviceId);
    if (!perDevice || !cancel) return;
    cancel();
    perDevice.delete(deviceId);
    this.progress({ jobId, deviceId, status: ok ? "ok" : "failed", error });
    this.cleanup(jobId);
  }

  /** 仍在等待回执的台数（测试/可观测用）。 */
  pendingCount(jobId: string): number {
    return this.pending.get(jobId)?.size ?? 0;
  }

  private cleanup(jobId: string): void {
    const perDevice = this.pending.get(jobId);
    if (perDevice && perDevice.size === 0) this.pending.delete(jobId);
  }
}
