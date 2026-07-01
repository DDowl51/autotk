import dgram from "react-native-udp";
import { parseBeacon, DISCOVERY_PORT } from "./beacon";

export interface Discovery {
  stop(): void;
}

/**
 * 局域网自动发现控制中心：监听 UDP 广播，收到 beacon → 回调 http://<来源IP>:<port>。
 * 依赖 react-native-udp（原生模块，需 dev build / prebuild）；Expo Go 下不可用会抛，
 * 调用方（useEngine）已 try/catch 兜底（退回扫码/手填）。
 */
export function startHubDiscovery(onFound: (url: string) => void): Discovery {
  const socket = dgram.createSocket({ type: "udp4" });
  socket.on("message", (msg: Buffer | string, rinfo: { address?: string }) => {
    const text = typeof msg === "string" ? msg : msg.toString();
    const b = parseBeacon(text);
    if (b && rinfo?.address) onFound(`http://${rinfo.address}:${b.port}`);
  });
  socket.on("error", () => {
    try {
      socket.close();
    } catch {
      /* ignore */
    }
  });
  socket.bind(DISCOVERY_PORT);
  return {
    stop() {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    },
  };
}
