// 收视频端 socket.io 服务(接线层,像 run.ts 不单测;逻辑在 receiverRegistry,有测)。
// 暴露 ReceiverHub 供 W3 发布编排依赖(W3 测试直接 mock 此接口)。
import { Server as IOServer } from "socket.io";
import { createReceiverRegistry, type ReceiverConn } from "./receiverRegistry";
import { RECV_EVT, type DownloadCommand, type ReceiverHello, type ReceiverProgress } from "./protocol";

export interface ReceiverHub {
  isOnline(udid: string): boolean;
  /** 下发下载命令;端离线 → reject(编排据此直接判 failed)。 */
  pushDownload(udid: string, cmd: DownloadCommand): Promise<void>;
  onProgress(cb: (udid: string, p: ReceiverProgress) => void): void;
  close(): Promise<void>;
}

export function createReceiverHub(opts: { port: number; log?(m: string): void }): ReceiverHub {
  const registry = createReceiverRegistry();
  const io = new IOServer(opts.port, { transports: ["websocket"], cors: { origin: "*" } });

  io.on("connection", (socket) => {
    let udid: string | null = null;
    const conn: ReceiverConn = { send: (cmd) => void socket.emit(RECV_EVT.download, cmd) };
    socket.on(RECV_EVT.hello, (m: ReceiverHello) => {
      if (!m?.udid) return;
      udid = m.udid;
      registry.attach(udid, conn);
      opts.log?.(`[receiver] ${udid} 上线`);
    });
    socket.on(RECV_EVT.progress, (p: ReceiverProgress) => {
      if (udid) registry.handleProgress(udid, p);
    });
    socket.on("disconnect", () => {
      if (udid) registry.detach(udid, conn);
    });
  });

  return {
    isOnline: (udid) => registry.isOnline(udid),
    pushDownload: async (udid, cmd) => registry.pushDownload(udid, cmd),
    onProgress: (cb) => registry.onProgress(cb),
    close: () => new Promise<void>((resolve) => io.close(() => resolve())),
  };
}
