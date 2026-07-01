// 管理中心 Hub 接入配置。url 为空 = 未连接（autotk 仍可独立运行）。
// 地址来源优先级：运行时设定（扫码/自动发现/持久化）> 构建期 EXPO_PUBLIC_HUB_URL。
let currentUrl = process.env.EXPO_PUBLIC_HUB_URL ?? "";

export const HUB_CONFIG = {
  get url(): string {
    return currentUrl;
  },
};

export function hubEnabled(): boolean {
  return !!currentUrl;
}

/** 运行时设定 Hub 地址（来自扫码/自动发现/加载的持久化值）。 */
export function setHubUrl(url: string): void {
  currentUrl = (url || "").trim();
}
