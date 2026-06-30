// 模拟手机端：连 Hub、定时上报随机状态。用于在没有真机时演示/调试看板。
// 用法：npm run mock -- [deviceId] [deviceName]
import { io } from "socket.io-client";
import { EVT } from "@mc/shared";

const URL = process.env.HUB_URL ?? "http://localhost:4000";
const deviceId = process.argv[2] ?? "mock-" + Math.random().toString(36).slice(2, 7);
const deviceName = process.argv[3] ?? "模拟手机-" + deviceId.slice(-3);

const socket = io(URL, {
  auth: { role: "device", deviceId, deviceName, version: "mock" },
  transports: ["websocket"],
});

socket.on("connect", () => console.log(`[mock] ${deviceName} 已连上 ${URL}`));
socket.on("disconnect", () => console.log(`[mock] ${deviceName} 断开`));

// 演示日志：有人查看时打印「切快频」，并周期性上报随机日志。
socket.on(EVT.logsWanted, (m: { on?: boolean }) =>
  console.log(`[mock] ${deviceName} 日志频率 → ${m?.on ? "快(被查看)" : "慢"}`),
);
const LOG_SAMPLES: Array<{ level: "info" | "warn" | "error"; msg: string }> = [
  { level: "info", msg: "点赞当前视频" },
  { level: "info", msg: "滑到下一个视频" },
  { level: "info", msg: "进入评论区" },
  { level: "warn", msg: "检测到系统弹窗，已选择 Not Now" },
  { level: "error", msg: "WDA 请求超时，重试中" },
];
setInterval(() => {
  const s = LOG_SAMPLES[Math.floor(Math.random() * LOG_SAMPLES.length)];
  socket.emit(EVT.deviceLog, { lines: [{ ...s, ts: Date.now() }] });
}, 1500);

// 演示发布：收到发布任务 → 模拟「下载→入相册→发布」逐步回报（便于没真机时测发布页）。
socket.on(EVT.publishTask, (t: { taskId: string; videoName?: string }) => {
  console.log(`[mock] ${deviceName} 收到发布任务 ${t.taskId}：${t.videoName ?? ""}`);
  const steps: Array<["downloading" | "downloaded" | "publishing" | "published", number]> = [
    ["downloading", 500],
    ["downloaded", 1100],
    ["publishing", 1600],
    ["published", 2300],
  ];
  for (const [status, delay] of steps) {
    setTimeout(() => socket.emit(EVT.publishResult, { taskId: t.taskId, status }), delay);
  }
});

const modules = ["forYou", "kwSearch", "persHome"];
const pages = ["feed", "comments", "search", "profile"];
let likes = 0;
let follows = 0;
let comments = 0;
let videos = 0;

setInterval(() => {
  likes += Math.floor(Math.random() * 3);
  follows += Math.random() < 0.3 ? 1 : 0;
  comments += Math.random() < 0.2 ? 1 : 0;
  videos += 1;
  socket.emit(EVT.deviceStatus, {
    running: true,
    module: modules[Math.floor(Math.random() * modules.length)],
    page: pages[Math.floor(Math.random() * pages.length)],
    stats: { likes, follows, comments, videos },
    alert: Math.random() < 0.08 ? "弹窗卡住（模拟告警）" : null,
    ts: Date.now(),
  });
}, 3000);
