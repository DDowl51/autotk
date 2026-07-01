import { createServer, type Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import path from "node:path";
import { DeviceRegistry } from "./domain/registry";
import { LogHub } from "./domain/log-hub";
import { AliasStore } from "./domain/alias-store";
import { MemoryDeviceStore } from "./adapters/memory-store";
import { attachGateway } from "./gateway";
import { RelayStore, handleRelay } from "./relay";

export interface StartHubOptions {
  /** 起始端口（默认 env PORT 或 4000）。被占用则依次 +1 回退。 */
  port?: number;
  /** 别名等持久化目录（默认 env HUB_DATA_DIR 或 ./hub-data）。 */
  dataDir?: string;
  /** 端口被占用时最多回退几次（默认 20）。 */
  maxPortTries?: number;
  /** 监听成功回调（拿到实际端口）。替代原本的 console.log。 */
  onListening?: (port: number) => void;
}

/** 可控的 Hub 句柄，供内嵌方（Electron）读取端口与优雅关闭。 */
export interface HubHandle {
  httpServer: HttpServer;
  io: Server;
  registry: DeviceRegistry;
  logHub: LogHub;
  /** 实际监听到的端口（可能因回退而非起始端口）。 */
  port: number;
  close(): Promise<void>;
}

/** 监听，端口被占用（EADDRINUSE）则 +1 回退，返回实际端口。 */
function listen(server: HttpServer, basePort: number, maxTries: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = (p: number) => {
      const onError = (e: NodeJS.ErrnoException) => {
        if (e.code === "EADDRINUSE" && tries < maxTries) {
          tries++;
          attempt(basePort + tries);
        } else {
          reject(e);
        }
      };
      server.once("error", onError);
      server.listen(p, () => {
        server.removeListener("error", onError);
        const a = server.address();
        resolve(typeof a === "object" && a ? a.port : p);
      });
    };
    attempt(basePort);
  });
}

/**
 * 启动 Hub（socket.io + /relay 中转），返回可控句柄。
 * CLI（main.ts）与 Electron 主进程共用此工厂。
 */
export async function startHub(opts: StartHubOptions = {}): Promise<HubHandle> {
  const basePort = opts.port ?? Number(process.env.PORT ?? 4000);
  const dataDir = opts.dataDir ?? process.env.HUB_DATA_DIR ?? "./hub-data";
  const maxTries = opts.maxPortTries ?? 20;

  const relay = new RelayStore();
  // 先处理 /relay 的跨网中转，其余请求交给 socket.io。
  const httpServer = createServer((req, res) => {
    if (!handleRelay(relay, req, res)) {
      res.writeHead(426).end("upgrade required");
    }
  });
  const io = new Server(httpServer, { cors: { origin: "*" } });
  const aliases = new AliasStore(path.join(dataDir, "aliases.json"));
  const registry = new DeviceRegistry(new MemoryDeviceStore(), Date.now, aliases);
  const logHub = new LogHub();
  attachGateway(io, registry, logHub);

  // 先加载别名再监听，确保首个连接的快照已带别名。
  await aliases.load();
  const port = await listen(httpServer, basePort, maxTries);
  opts.onListening?.(port);

  return {
    httpServer,
    io,
    registry,
    logHub,
    port,
    close: () => new Promise<void>((resolve) => io.close(() => resolve())),
  };
}
