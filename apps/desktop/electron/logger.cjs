// 本地日志：按日期写 JSON 行到 app 的 logs 目录，供买家「发日志给卖家排查」（无外部服务）。
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

let cachedDir = null;
function dir() {
  if (cachedDir) return cachedDir;
  try {
    cachedDir = app.getPath("logs"); // Windows: %APPDATA%/<App>/logs
  } catch {
    cachedDir = path.join(app.getPath("userData") || ".", "logs");
  }
  try {
    fs.mkdirSync(cachedDir, { recursive: true });
  } catch {
    /* 建目录失败仍尝试写，写失败再吞 */
  }
  return cachedDir;
}

function fileForToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return path.join(dir(), `app-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.log`);
}

function write(level, msg, extra) {
  const entry = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(extra || {}) });
  // eslint-disable-next-line no-console
  (level === "error" ? console.error : console.log)(`[${level}] ${msg}`);
  try {
    fs.appendFileSync(fileForToday(), entry + "\n", "utf8");
  } catch {
    /* 写日志失败不影响主流程 */
  }
}

module.exports = {
  info: (msg, extra) => write("info", msg, extra),
  error: (msg, err) =>
    write(
      "error",
      msg,
      err instanceof Error
        ? { error: err.message, stack: (err.stack || "").slice(0, 600) }
        : err
          ? { error: String(err) }
          : undefined,
    ),
  logDir: dir,
};
