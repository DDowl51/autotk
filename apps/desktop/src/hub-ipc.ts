// P1：内嵌 Hub 的渲染层访问口（由 preload 的 window.hub 暴露）。
// 桌面应用内：自动连本机内嵌 Hub；浏览器预览时返回 null（退回手填地址）。

export interface HubApi {
  available: boolean;
  /** 内嵌 Hub 实际监听端口（渲染层连 localhost:port）。 */
  getPort(): Promise<number>;
  /** 本机局域网 IPv4（二维码用 http://<ip>:<port> 让手机扫）。 */
  getLanIp(): Promise<string>;
}

export function getHubApi(): HubApi | null {
  const api = (globalThis as { hub?: HubApi }).hub;
  return api?.available ? api : null;
}
