const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const os = require("node:os");
const fsp = require("node:fs/promises");
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
  // 数据目录固定到 userData（如 %APPDATA%/<App>/hub-data），不用 startHub 默认的 cwd 相对 "./hub-data"——
  // 否则买家用快捷方式/开机自启从不同工作目录启动，设备别名/离线补发/定时任务会分家、像「莫名丢失」。
  const dataDir = path.join(app.getPath("userData"), "hub-data");
  hub = await startHub({
    ports: HUB_PORTS, // 按共享端口表挑第一个空闲；手机端按同表兜底重连
    dataDir,
    // 发布成功 → 服务端权威登记已发去重（不依赖发布页当时是否开着；桌面缺席/重启也不漏记、不重发）。
    onPublished: (deviceId, videoName) => void handlePublished(deviceId, videoName),
  });
  startBeacon(hub.port);
  return hub.port;
}

// 发布成功后登记「已发去重」：解析设备当前名（含别名）→ 对应文件夹写 manifest。
// 由 Hub 的 published 回报驱动，与操作员发布页是否开着无关（修 C3 的重复发）。
async function handlePublished(deviceId, videoName) {
  try {
    if (!lastRootDir) return; // 还没配过视频根目录 → 无从登记
    const list = hub ? await hub.registry.snapshot() : [];
    const dev = list.find((d) => d.deviceId === deviceId);
    if (!dev) return;
    const a = await agentForMark();
    if (a) await a.markPublished(dev.deviceName, videoName);
  } catch (e) {
    logger.error("登记已发去重失败", e);
  }
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
// 记住最近一次视频根目录（渲染层 refresh 时给），持久化到 userData——
// 供桌面重启后、渲染层还没打开发布页时，Hub 的 published 回报也能自主 markPublished。
let lastRootDir = null;
const rootDirFile = () => path.join(app.getPath("userData"), "publisher-root.json");
async function loadRootDir() {
  try {
    const d = JSON.parse(await fsp.readFile(rootDirFile(), "utf8"));
    if (d && typeof d.rootDir === "string") lastRootDir = d.rootDir;
  } catch {
    /* 首次运行/无文件 → 无 */
  }
}
async function persistRootDir(dir) {
  if (!dir || dir === lastRootDir) return;
  lastRootDir = dir;
  try {
    await fsp.writeFile(rootDirFile(), JSON.stringify({ rootDir: dir }));
  } catch {
    /* 落盘失败忽略 */
  }
}
// 取一个可用于 markPublished 的 agent：优先复用渲染层建好的（不覆盖其 schedule）；
// 没有则从持久化的 lastRootDir 懒建一个（重启后无渲染层交互也能登记去重）。
async function agentForMark() {
  if (agent) return agent;
  if (!lastRootDir) return null;
  await ensureLan();
  agent = new publisher.PublishAgent({ rootDir: lastRootDir, schedule: { allDay: true, taskWindows: [] }, lan });
  return agent;
}

// 局域网直传服务：带持久化文件，桌面重启后恢复 token→路径映射 + 端口，
// 让定时/离线补发任务里持久化的旧下发 URL 仍能被手机下载（否则重启后必 404）。
async function ensureLan() {
  if (lan) return lan;
  const persistFile = path.join(app.getPath("userData"), "lan-tokens.json");
  lan = new publisher.LanFileServer(persistFile);
  const savedPort = await lan.restore(); // 恢复旧映射 + 上次端口
  await lan.start("0.0.0.0", savedPort ?? 0); // 0.0.0.0 让同网手机可访问；优先复用旧端口
  return lan;
}

async function ensureAgent(rootDir, schedule) {
  await ensureLan();
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

handle("publisher:refresh", async (_e, { rootDir, schedule, deviceNames }) => {
  await persistRootDir(rootDir); // 记住根目录，供 Hub published 回报自主登记去重
  const a = await ensureAgent(rootDir, schedule);
  // 按当前在线设备名自动建好对应子文件夹，买家直接往里丢视频即可（兑现空态里那句「自动建文件夹」）。
  if (rootDir && Array.isArray(deviceNames)) {
    for (const name of deviceNames) {
      if (name) await publisher.ensureDeviceFolder(rootDir, name).catch(() => {});
    }
  }
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
    await loadRootDir(); // 先读回持久化的根目录，供 Hub 启动即重排的定时任务发布成功后自主登记去重
    await ensureHub(); // 先起内嵌 Hub 再开窗，渲染层一挂载即可连 localhost
    logger.info(`内嵌 Hub 已启动 :${hub ? hub.port : "?"}`);
    // 内嵌 Hub 会立刻把持久化的定时/离线补发任务重新下发，其下载 URL 指向 LAN 服务——
    // 故 LAN 服务必须先于「渲染层打开发布页」就绪并恢复旧 token，否则重启后这些任务下载必 404。
    await ensureLan();
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
  // 置空（对齐 stopHub 里 hub=null 的做法）：macOS 关窗后 app 不退出，
  // 若不清 lan/agent，再开窗 ensureAgent 会复用这台**已关闭**的 LanFileServer，
  // 导致手机下载视频连不上（死连）。清掉 → 下次重开窗重新起一台。
  lan = null;
  agent = null;
  stopHub();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
