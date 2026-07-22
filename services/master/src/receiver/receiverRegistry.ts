// 收视频端路由注册表(纯逻辑,可测):udid → 当前连接 + 在线态 + 下载命令下发 + 进度分发。
// 不碰 socket.io —— receiverServer 把真连接喂进来。重连安全:detach 只对「当前连接」生效。
import type { DownloadCommand, ReceiverProgress } from "./protocol";

/** 一条到某收视频端的连接(能下发命令);receiverServer 用 socket 实现,测试用假实现。 */
export interface ReceiverConn {
  send(cmd: DownloadCommand): void;
}

export interface ReceiverRegistry {
  attach(udid: string, conn: ReceiverConn): void;
  /** 仅当传入连接 == 当前连接才下线(旧连接迟到 disconnect 被忽略,防幽灵下线)。 */
  detach(udid: string, conn: ReceiverConn): void;
  isOnline(udid: string): boolean;
  /** 下发下载命令;端离线 → 抛错(编排据此直接判 failed)。 */
  pushDownload(udid: string, cmd: DownloadCommand): void;
  onProgress(cb: (udid: string, p: ReceiverProgress) => void): void;
  /** receiverServer 收到 receiver:progress 时调用,分发给订阅者。 */
  handleProgress(udid: string, p: ReceiverProgress): void;
}

export function createReceiverRegistry(): ReceiverRegistry {
  const conns = new Map<string, ReceiverConn>();
  const subs: ((udid: string, p: ReceiverProgress) => void)[] = [];

  return {
    attach(udid, conn) {
      conns.set(udid, conn);
    },
    detach(udid, conn) {
      if (conns.get(udid) === conn) conns.delete(udid);
    },
    isOnline(udid) {
      return conns.has(udid);
    },
    pushDownload(udid, cmd) {
      const conn = conns.get(udid);
      if (!conn) throw new Error(`收视频端离线: ${udid}`);
      conn.send(cmd);
    },
    onProgress(cb) {
      subs.push(cb);
    },
    handleProgress(udid, p) {
      for (const cb of subs) cb(udid, p);
    },
  };
}
