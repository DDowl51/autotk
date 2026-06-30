const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
// 阶段3 文件夹工作流的本地逻辑（扫描/去重/文案/排程/局域网直传/中转）。
// 需先构建：npm run build -w @mc/publisher（产出 dist/，本文件 require 之）。
const publisher = require("@mc/publisher");

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

ipcMain.handle("publisher:chooseRoot", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
});

ipcMain.handle("publisher:refresh", async (_e, { rootDir, schedule }) => {
  const a = await ensureAgent(rootDir, schedule);
  return a.refresh();
});

ipcMain.handle("publisher:prepareSource", async (_e, { deviceName, fileName, mode, hubBase }) => {
  if (!agent) throw new Error("请先扫描根目录");
  return agent.prepareSource(deviceName, fileName, mode, hubBase); // lan 已在 refresh 时启动
});

ipcMain.handle("publisher:markPublished", async (_e, { deviceName, fileName }) => {
  if (!agent) return;
  return agent.markPublished(deviceName, fileName);
});

ipcMain.handle("publisher:renameFolder", async (_e, { oldName, newName }) => {
  if (!agent) return; // 还没设过根目录就没文件夹可改
  return agent.renameDeviceFolder(oldName, newName);
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (lan) lan.close().catch(() => {});
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
