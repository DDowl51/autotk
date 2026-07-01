/**
 * 校验/归一化「控制中心地址」（扫码或手动输入）。纯逻辑，便于单测。
 * 只接受 http(s)://host[:port]，取到 scheme://host 部分（丢弃多余路径），非法返回 null。
 * 不用 URL 以避免 RN 上 URL polyfill 的不确定性。
 */
export function parseHubQr(text: string): string | null {
  const s = (text || "").trim();
  const m = /^(https?:\/\/[^/\s]+)(?:\/.*)?$/i.exec(s);
  return m ? m[1] : null;
}

// 内嵌 Hub 的共享候选端口表（第三层兜底）：已知 IP、端口变了、又收不到 UDP 广播时，
// 按此表在该 IP 上逐个端口探测重连。
// ⚠️ 耦合缝：必须与桌面 apps/desktop/electron/netutil.cjs 的 HUB_PORTS 逐一致，改一处两处同步。
export const HUB_PORTS = [4000, 51820, 53170, 55555, 57340];

/** 取地址里的 host（去掉 scheme / 端口 / 路径）；非法返回 null。 */
export function hostOf(url: string): string | null {
  const m = /^https?:\/\/([^/:\s]+)/i.exec((url || "").trim());
  return m ? m[1] : null;
}

/** 已知 host 时，按共享端口表生成候选地址（端口兜底重连用）。 */
export function candidateUrls(host: string): string[] {
  return HUB_PORTS.map((p) => `http://${host}:${p}`);
}
