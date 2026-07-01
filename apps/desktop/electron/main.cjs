const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const os = require("node:os");
const dgram = require("node:dgram");
// 阶段3 文件夹工作流的本地逻辑（扫描/去重/文案/排程/局域网直传/中转）。
// 需先构建：npm run build -w @mc/publisher（产出 dist/，本文件 require 之）。
const publisher = require("@mc/publisher");
// P1：内嵌 Hub（需先构建 @mc/shared 与 @mc/hub 的 CJS dist）。
const { startHub } = require("@mc/hub");
const { pickLanIPv4, encodeBeacon, DISCOVERY_PORT, HUB_PORTS } = require("./netutil.cjs");
const logger = require("./logger.cjs");

// 全局兜底：一处游离错误 / 未处理拒绝不静默崩、也不带崩内嵌 Hub；记本地日志。
let fatalShown = false;
process.on("uncaughtException", (err) => {
  logger.error("未捕获异常", err);
  if (!fatalShown) {
    fatalShown = true;
    try {
      dialog.showErrorBox("出错了", "软件遇到一个错误，已记录日志。若功能异常请重启软件。");
    } catch {
      /* dialog 不可用则仅记日志 */
    }
  }
});
process.on("unhandledRejection", (reason) => {
  logger.error("未处理的 Promise 拒绝", reason);
});

// IPC 薄包裹：handler 抛错记日志后按原样回抛（渲染层拿到 rejection，主进程不受影响）。
function handle(channel, fn) {
  ipcMain.handle(channel, async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      logger.error(`IPC ${channel} 失败`, e);
      throw e;
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

// ——— 内嵌 Hub + 局域网自动发现广播 ———
let hub = null; // HubHandle
let beacon = null; // dgram socket
let beaconTimer = null;

async function ensureHub() {
  if (hub) return hub.port;
  hub = await startHub({ ports: HUB_PORTS }); // 按共享端口表挑第一个空闲；手机端按同表兜底重连
  startBeacon(hub.port);
  return hub.port;
}

// 每 3s 向局域网广播 { svc, port }，供同网手机自动发现（无需扫码）。
function startBeacon(port) {
  try {
    beacon = dgram.createSocket({ type: "udp4", reuseAddr: true });
    beacon.on("error", () => {}); // 广播失败不影响主流程
    beacon.bind(() => {
      try {
        beacon.setBroadcast(true);
      } catch {
        /* 某些环境不允许广播，忽略；手机可改用扫码 */
      }
    });
    const msg = Buffer.from(encodeBeacon(port));
    const send = () => beacon && beacon.send(msg, 0, msg.length, DISCOVERY_PORT, "255.255.255.255", () => {});
    beaconTimer = setInterval(send, 3000);
    send();
  } catch {
    /* 广播不可用不影响：扫码仍可连 */
  }
}

function stopHub() {
  if (beaconTimer) clearInterval(beaconTimer);
  beaconTimer = null;
  if (beacon) {
    try {
      beacon.close();
    } catch {
      /* ignore */
    }
  }
  beacon = null;
  if (hub) hub.close().catch(() => {});
  hub = null;
}

// ——— 发布代理（懒启动）———
let lan = null;
let agent = null;

async function ensureAgent(rootDir, schedule) {
  if (!lan) {
    lan = new publisher.LanFileServer();
    await lan.start("0.0.0.0", 0); // 0.0.0.0 让同网手机可访问
  }
  if (!agent) {
    agent = new publisher.PublishAgent({ rootDir, schedule, lan });
  } else {
    agent.setRoot(rootDir);
    agent.setSchedule(schedule);
  }
  return agent;
}

// 内嵌 Hub：渲染层拿端口连 localhost；二维码用本机局域网 IP。
handle("hub:port", async () => ensureHub());
handle("hub:lanIp", async () => pickLanIPv4(os.networkInterfaces()));

handle("publisher:chooseRoot", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
});

handle("publisher:refresh", async (_e, { rootDir, schedule }) => {
  const a = await ensureAgent(rootDir, schedule);
  return a.refresh();
});

handle("publisher:prepareSource", async (_e, { deviceName, fileName, mode, hubBase }) => {
  if (!agent) throw new Error("请先扫描根目录");
  return agent.prepareSource(deviceName, fileName, mode, hubBase); // lan 已在 refresh 时启动
});

handle("publisher:markPublished", async (_e, { deviceName, fileName }) => {
  if (!agent) return;
  return agent.markPublished(deviceName, fileName);
});

handle("publisher:renameFolder", async (_e, { oldName, newName }) => {
  if (!agent) return; // 还没设过根目录就没文件夹可改
  return agent.renameDeviceFolder(oldName, newName);
});

app.whenReady().then(async () => {
  try {
    await ensureHub(); // 先起内嵌 Hub 再开窗，渲染层一挂载即可连 localhost
    logger.info(`内嵌 Hub 已启动 :${hub ? hub.port : "?"}`);
  } catch (e) {
    logger.error("内嵌 Hub 启动失败", e);
    try {
      dialog.showMessageBoxSync({
        type: "error",
        buttons: ["知道了"],
        title: "控制中心启动失败",
        message: "控制中心未能启动（端口可能被占用）。请关闭其他占用程序后重启本软件。",
      });
    } catch {
      /* ignore */
    }
  }
  createWindow();
});

app.on("window-all-closed", () => {
  if (lan) lan.close().catch(() => {});
  stopHub();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
