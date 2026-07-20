// socket.io 客户端的最小抽象 —— 让 hubClient 可注入假 socket 离线测试。
import { io } from "socket.io-client";

/** 连 Hub 的设备身份(flat:每台一份)。 */
export interface SocketAuth {
  role: "device";
  deviceId: string;
  deviceName: string;
  version?: string;
}

/** hubClient 只用到 socket 的这几样;测试注入内存实现。 */
export interface MinimalSocket {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- socket 事件负载类型在各 on 处收窄
  on(event: string, cb: (...args: any[]) => void): unknown;
  emit(event: string, payload?: unknown): unknown;
  disconnect(): unknown;
  readonly connected: boolean;
}

export type SocketFactory = (url: string, auth: SocketAuth) => MinimalSocket;

/** 真实工厂:socket.io-client;无限重试 + 有界退避(Hub 晚起/重启/IP 变都能自连,同旧手机端)。 */
export const realSocketFactory: SocketFactory = (url, auth) =>
  io(url, {
    auth,
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  }) as unknown as MinimalSocket;
