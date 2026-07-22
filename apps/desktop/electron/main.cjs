const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const os = require("node:os");
const fss = require("node:fs");
const fsp = require("node:fs/promises");
const dgram = require("node:dgram");
const { spawn } = require("node:child_process");
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

// ——— 自动拉起 master（一台机=一个桌面端就够：desktop 起内嵌 Hub 后顺带把 master 跑起来，
// master 自动发现局域网 :8100 的手机 → 注册到本 Hub → 设备页就出现，无需手动起 master、无需手填 IP）———
let masterProc = null;
// 仓库根（dev：electron 从源码跑）。打包后无 master 源码 → spawn 会失败，已 try/catch 兜底不影响桌面。
const repoRoot = () => path.join(__dirname, "..", "..", "..");

// 后台（master）设置：GPU 识别服务地址 + 扫描网段。存 userData，渲染层「设置」页可改，改完重启 master 生效。
// 打包版遇到多网卡/远端 GPU 时，靠这里零命令配置（不用改环境变量）。
const masterSettingsFile = () => path.join(app.getPath("userData"), "master-settings.json");
let masterSettings = { vlmUrl: "", subnet: "" };
async function loadMasterSettings() {
  try {
    const d = JSON.parse(await fsp.readFile(masterSettingsFile(), "utf8"));
    masterSettings = { vlmUrl: ((d && d.vlmUrl) || "").trim(), subnet: ((d && d.subnet) || "").trim() };
  } catch {
    /* 首次运行/无文件 → 用默认（空 vlmUrl=本机 :8000；空 subnet=自动挑本机私网卡） */
  }
}
async function saveMasterSettings(s) {
  masterSettings = { vlmUrl: (((s && s.vlmUrl) || "")).trim(), subnet: (((s && s.subnet) || "")).trim() };
  try {
    await fsp.writeFile(masterSettingsFile(), JSON.stringify(masterSettings));
  } catch {
    /* 落盘失败忽略（仍以内存值重启 master 生效） */
  }
  return masterSettings;
}
function restartMaster() {
  stopMaster();
  // 等旧进程被 taskkill 收掉，再用新设置起（避免两份同时扫/注册）。
  setTimeout(() => {
    if (hub) startMaster(hub.port);
  }, 1500);
}

function startMaster(hubPort) {
  if (process.env.MASTER_AUTOSTART === "0") return; // 想单独手动起 master 时可关
  if (masterProc) return;
  // VLM 地址优先级：设置页填的 > 环境变量 > 默认本机 :8000（desktop 与 perception 同机的常见部署）。
  const vlmUrl = masterSettings.vlmUrl || process.env.VLM_URL || process.env.MASTER_VLM_URL || "http://localhost:8000";
  const env = {
    ...process.env,
    HUB_URL: `http://localhost:${hubPort}`, // 连本机内嵌 Hub
    MASTER_DISCOVER: "1", // 自动发现局域网手机
    MASTER_VLM_URL: vlmUrl, // 无 devices.json 时用它合成最小配置
  };
  const subnet = masterSettings.subnet || process.env.MASTER_SUBNET; // 设置页填的网段优先
  if (subnet) env.MASTER_SUBNET = subnet;
  // 打包后 master 被 esbuild 打成 build/master.cjs（与 main.cjs 同级);有它就用 electron 自带 node 跑,
  // 不依赖外部 pnpm/node → 真·一个软件搞定。dev 从源码跑时没有它 → 退回 pnpm 起 master。
  const bundled = path.join(__dirname, "master.cjs");
  try {
    if (fss.existsSync(bundled)) {
      env.ELECTRON_RUN_AS_NODE = "1"; // 让 electron 二进制以纯 node 模式跑 bundle
      masterProc = spawn(process.execPath, [bundled], { cwd: app.getPath("userData"), env });
    } else {
      // shell:true → Windows 上能找到 pnpm(.cmd)。cwd=仓库根;pnpm --filter 会切到 services/master 跑其 start。
      masterProc = spawn("pnpm", ["--filter", "@mc/master", "start"], { cwd: repoRoot(), env, shell: true });
    }
    logger.info(`自动拉起 master（pid ${masterProc.pid}）VLM=${vlmUrl}，自动发现开;${fss.existsSync(bundled) ? "打包版(bundle)" : "dev(pnpm)"}`);
    const fwd = (buf) => {
      const s = buf.toString().trimEnd();
      if (s) {
        console.log(s); // dev 终端可见
        logger.info("[master] " + s);
      }
    };
    masterProc.stdout && masterProc.stdout.on("data", fwd);
    masterProc.stderr && masterProc.stderr.on("data", fwd);
    masterProc.on("exit", (code) => {
      logger.info(`master 退出（code ${code}）`);
      masterProc = null;
    });
    masterProc.on("error", (e) => {
      logger.error("拉起 master 失败", e);
      masterProc = null;
    });
  } catch (e) {
    logger.error("拉起 master 失败", e);
    masterProc = null;
  }
}

function stopMaster() {
  if (!masterProc) return;
  const pid = masterProc.pid;
  try {
    // Windows：pnpm→node 是进程树,taskkill /T 连子进程一起收(否则 master 会残留占着手机会话)。
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(pid), "/T", "/F"]);
    else masterProc.kill("SIGINT");
  } catch {
    /* ignore */
  }
  masterProc = null;
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

// 后台设置（GPU 识别地址 + 扫描网段）：读/存；存后用新设置重启 master。
handle("master:getSettings", async () => masterSettings);
handle("master:saveSettings", async (_e, s) => {
  const saved = await saveMasterSettings(s);
  restartMaster();
  return saved;
});

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
    await loadMasterSettings(); // 读设置页保存的 GPU 地址/网段(供 startMaster 使用)
    if (hub) startMaster(hub.port); // 顺带把 master 跑起来（自动发现手机 → 注册回本 Hub）
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
  stopMaster();
  stopHub();
  if (process.platform !== "darwin") app.quit();
});

// 兜底：进程退出前一定收掉 master（避免残留占着手机 WDA 会话）。
app.on("before-quit", stopMaster);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
