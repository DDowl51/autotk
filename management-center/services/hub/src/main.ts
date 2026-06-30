import { createServer } from "node:http";
import { Server } from "socket.io";
import path from "node:path";
import { DeviceRegistry } from "./domain/registry";
import { LogHub } from "./domain/log-hub";
import { AliasStore } from "./domain/alias-store";
import { MemoryDeviceStore } from "./adapters/memory-store";
import { attachGateway } from "./gateway";
import { RelayStore, handleRelay } from "./relay";

const PORT = Number(process.env.PORT ?? 4000);
const DATA_DIR = process.env.HUB_DATA_DIR ?? "./hub-data";

const relay = new RelayStore();
// 先处理 /relay 的跨网中转，其余请求交给 socket.io。
const httpServer = createServer((req, res) => {
  if (!handleRelay(relay, req, res)) {
    res.writeHead(426).end("upgrade required"); // 非 /relay 且非 ws：交给 socket.io 的 upgrade
  }
});
const io = new Server(httpServer, { cors: { origin: "*" } });
const aliases = new AliasStore(path.join(DATA_DIR, "aliases.json"));
const registry = new DeviceRegistry(new MemoryDeviceStore(), Date.now, aliases);
const logHub = new LogHub();
attachGateway(io, registry, logHub);

// 先加载别名再监听，确保首个连接的快照已带别名。
void aliases.load().then(() => {
  httpServer.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`hub on :${PORT}`);
  });
});
