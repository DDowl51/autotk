import { io, type Socket } from "socket.io-client";
import {
  EVT,
  type DeviceStatus,
  type DeviceLogMsg,
  type ConfigApplyMsg,
  type PublishTaskMsg,
  type PublishStatus,
} from "./protocol";
import { LogBuffer } from "./reporter";

export interface HubClientOptions {
  url: string;
  deviceId: string;
  deviceName: string;
  version?: string;
  /** 收到批量配置下发时回调（useEngine 注入：校验+落库+回执）。 */
  onConfigApply?: (m: ConfigApplyMsg) => void;
  /** 收到发布任务时回调（useEngine 注入：下载入相册→发布→回报）。 */
  onPublishTask?: (m: PublishTaskMsg) => void;
  /** 连接状态变化回调（用于 UI 显示「已连接/未连接控制中心」）。 */
  onConnectionChange?: (connected: boolean) => void;
}

/**
 * 手机端 Hub 客户端：以 device 身份连 Hub，定时上报状态 + 批量上报日志。
 * 日志频率随"是否被操作员查看"切换（看 1s / 不看 8s），省带宽。
 */
export class HubClient {
  private socket: Socket | null = null;
  private readonly buf = new LogBuffer();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private watched = false;

  constructor(private readonly opts: HubClientOptions) {}

  connect(): void {
    if (this.socket) return;
    this.socket = io(this.opts.url, {
      auth: {
        role: "device",
        deviceId: this.opts.deviceId,
        deviceName: this.opts.deviceName,
        version: this.opts.version,
      },
      transports: ["websocket"],
      // 无限重试 + 有界退避：Hub 未启动 / 晚于手机启动 / 重启 / IP 变后都能自动连上。
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });
    const notify = () => this.opts.onConnectionChange?.(!!this.socket?.connected);
    this.socket.on("connect", notify);
    this.socket.on("disconnect", notify);
    this.socket.on("connect_error", notify);
    this.socket.on(EVT.logsWanted, (m: { on?: boolean }) => {
      this.watched = !!m?.on;
      this.scheduleFlush();
    });
    if (this.opts.onConfigApply) {
      this.socket.on(EVT.configApply, (m: ConfigApplyMsg) => this.opts.onConfigApply?.(m));
    }
    if (this.opts.onPublishTask) {
      this.socket.on(EVT.publishTask, (m: PublishTaskMsg) => this.opts.onPublishTask?.(m));
    }
    this.scheduleFlush();
  }

  reportStatus(s: DeviceStatus): void {
    this.socket?.emit(EVT.deviceStatus, s);
  }

  /** 回执一次配置下发的应用结果。 */
  reportConfigResult(jobId: string, ok: boolean, error?: string): void {
    this.socket?.emit(EVT.configResult, { jobId, ok, error });
  }

  /** 回报一次发布任务的状态（逐步：downloading/downloaded/publishing/published/failed）。 */
  reportPublishResult(taskId: string, status: PublishStatus, error?: string): void {
    this.socket?.emit(EVT.publishResult, { taskId, status, error });
  }

  log(line: DeviceLogMsg): void {
    this.buf.push(line);
  }

  isConnected(): boolean {
    return !!this.socket?.connected;
  }

  disconnect(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    const interval = this.watched ? 1000 : 8000;
    this.flushTimer = setInterval(() => this.flushLogs(), interval);
  }

  private flushLogs(): void {
    if (!this.socket?.connected) return;
    const lines = this.buf.flush();
    if (lines.length > 0) this.socket.emit(EVT.deviceLog, { lines });
  }
}
