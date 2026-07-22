// 连 master 的收视频控制通道(β1 后台常驻)。收视频端连出、location 保活维持连接。
// ⚠️ RN 运行时(socket.io-client);纯逻辑在 agent.ts(有测),本文件是接线,真机验。
import { io, type Socket } from "socket.io-client";
import { RECV_EVT, type DownloadCommand, type ReceiverProgress } from "./protocol";
import type { ReceiverAgent } from "./agent";

export interface SocketClientOpts {
  /** master 的收视频通道地址,如 http://<GPU机IP>:4610。 */
  masterUrl: string;
  /** 本机 udid(= Hub/编号),握手上报。 */
  udid: string;
  onConnectionChange?: (connected: boolean) => void;
}

export interface SocketClient {
  connect(agent: ReceiverAgent): void;
  sendProgress(p: ReceiverProgress): void;
  isConnected(): boolean;
  disconnect(): void;
}

export function createSocketClient(opts: SocketClientOpts): SocketClient {
  let socket: Socket | null = null;

  return {
    connect(agent) {
      if (socket) return;
      socket = io(opts.masterUrl, {
        transports: ["websocket"],
        // 无限重试 + 有界退避:master 晚起/重启/IP 变都能自连(同旧手机端连 Hub)。
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
      });
      const notify = () => opts.onConnectionChange?.(!!socket?.connected);
      socket.on("connect", () => {
        socket?.emit(RECV_EVT.hello, { type: "hello", udid: opts.udid }); // 上线握手
        notify();
      });
      socket.on("disconnect", notify);
      socket.on("connect_error", notify);
      socket.on(RECV_EVT.download, (cmd: DownloadCommand) => {
        void agent.onDownload(cmd);
      });
    },
    sendProgress(p) {
      socket?.emit(RECV_EVT.progress, p);
    },
    isConnected() {
      return !!socket?.connected;
    },
    disconnect() {
      socket?.close();
      socket = null;
    },
  };
}
