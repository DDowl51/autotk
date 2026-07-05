// 纯工具：局域网 IPv4 选取 + 自动发现 beacon 编解码。
// main.cjs（Electron 主进程）与 vitest 单测共用（CJS，便于两处 require）。
// beacon 格式即「桌面↔手机自动发现」的契约：手机端 src/hub/discovery.ts 需按同一格式解析。

// 虚拟机/VPN/容器网卡名关键词（小写子串匹配）。这些网卡也常拿 192.168.* 私网地址，
// 但手机根本连不上它们——必须按网卡名排除，否则可能把 VMware/Tailscale 的地址当成 LAN。
const VIRTUAL_IF = /vmware|virtualbox|\bvbox\b|vethernet|hyper-?v|tailscale|zerotier|\bwsl\b|docker|\bveth|\butun|\btun\d|\btap\d|npcap|radmin|hamachi|loopback/i;

/**
 * 从 os.networkInterfaces() 选一个「手机能连上」的局域网 IPv4。
 * 关键坑：os 枚举网卡的顺序不保证，且虚拟网卡(VMware/Hyper-V/Tailscale/Docker…)也常是 192.168.*，
 * 旧逻辑「取第一个私网 IP」会挑到手机连不上的虚拟网卡地址（真机实测显示 192.168.163.1/VMware）。
 * 现按**网卡名黑名单**排除虚拟/VPN 网卡（白名单会漏掉「以太网」等本地化命名，故用黑名单），
 * 再在真·物理网卡里优先私网段(WLAN/以太网)；都没有才逐级兜底，保持「宁可给个能显示的」。
 */
function pickLanIPv4(interfaces) {
  const rows = []; // { addr, virtual }
  for (const [name, addrs] of Object.entries(interfaces || {})) {
    const virtual = VIRTUAL_IF.test(name);
    for (const a of addrs || []) {
      // 跳过：非 IPv4 / 回环 / APIPA(169.254.* 没拿到 DHCP，连不上)
      if (a && a.family === "IPv4" && !a.internal && a.address && !/^169\.254\./.test(a.address)) {
        rows.push({ addr: a.address, virtual });
      }
    }
  }
  const isPriv = (ip) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  // 1) 真·物理网卡上的私网段（首选：WLAN / 以太网）
  const realPriv = rows.find((r) => !r.virtual && isPriv(r.addr));
  if (realPriv) return realPriv.addr;
  // 2) 真·物理网卡上任意 IPv4
  const real = rows.find((r) => !r.virtual);
  if (real) return real.addr;
  // 3) 兜底：任意私网段 → 任意 → 回环（只剩虚拟网卡时，给个能显示的也好过 127.0.0.1）
  const anyPriv = rows.find((r) => isPriv(r.addr));
  return (anyPriv && anyPriv.addr) || (rows[0] && rows[0].addr) || "127.0.0.1";
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
