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
