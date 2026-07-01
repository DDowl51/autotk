// 纯工具：局域网 IPv4 选取 + 自动发现 beacon 编解码。
// main.cjs（Electron 主进程）与 vitest 单测共用（CJS，便于两处 require）。
// beacon 格式即「桌面↔手机自动发现」的契约：手机端 src/hub/discovery.ts 需按同一格式解析。

/** 从 os.networkInterfaces() 选一个局域网 IPv4：优先私网段，跳过回环/非 IPv4；无则回环兜底。 */
function pickLanIPv4(interfaces) {
  const cands = [];
  for (const addrs of Object.values(interfaces || {})) {
    for (const a of addrs || []) {
      if (a && a.family === "IPv4" && !a.internal && a.address) cands.push(a.address);
    }
  }
  const priv = cands.find((ip) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip));
  return priv || cands[0] || "127.0.0.1";
}

/** 发现广播内容：标识本服务 + Hub 端口（IP 由接收方从 UDP 包来源地址取）。 */
function encodeBeacon(port) {
  return JSON.stringify({ svc: "autotk-hub", port });
}

/** 解析广播内容；非本服务/坏数据 → null。 */
function parseBeacon(text) {
  try {
    const o = JSON.parse(text);
    if (o && o.svc === "autotk-hub" && Number.isInteger(o.port) && o.port > 0) {
      return { port: o.port };
    }
  } catch {
    /* 坏数据忽略 */
  }
  return null;
}

/** 自动发现用的固定 UDP 端口。 */
const DISCOVERY_PORT = 41234;

// 内嵌 Hub 的共享候选端口表：内嵌方按此表挑第一个空闲端口起服；手机端在「已知 IP、
// 端口变了、又收不到 UDP 广播」时，也按同一份表逐个端口重连（第三层兜底）。
// ⚠️ 耦合缝：必须与手机端 apps/mobile/src/hub/hubUrl.ts 的 HUB_PORTS 逐一致，改一处两处同步。
const HUB_PORTS = [4000, 51820, 53170, 55555, 57340];

module.exports = { pickLanIPv4, encodeBeacon, parseBeacon, DISCOVERY_PORT, HUB_PORTS };
