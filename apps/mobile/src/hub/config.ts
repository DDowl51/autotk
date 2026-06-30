// 管理中心 Hub 接入配置。url 为空 = 不接 Hub（autotk 可独立运行）。
// 用 EXPO_PUBLIC_HUB_URL 在构建时注入，如 http://hub.example.com:4000。
export const HUB_CONFIG = {
  url: process.env.EXPO_PUBLIC_HUB_URL ?? "",
};

export function hubEnabled(): boolean {
  return !!HUB_CONFIG.url;
}
