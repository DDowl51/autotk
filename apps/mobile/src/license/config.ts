import { releaseConfigErrors } from "./releaseCheck";
import { licenseUrlOverride } from "./override";

// 激活码系统接入配置。
// productKey/secret 在 license 管理后台「产品」页创建产品时拿到（secret 只显示一次）。
// 注意：secret 会被打进客户端包内，属可被提取的明文——这是纯客户端方案的固有上限，
// 配合服务端设备绑定 + 心跳 + 远程封禁构成防破解基线。要更强可对 secret 做混淆/加固。
//
// 可用 EXPO_PUBLIC_* 环境变量在构建时覆盖（写进 .env，expo 会内联）。
const DEFAULT_BASE_URL = "https://your-license-server.example.com";

/**
 * 解析当前激活服务地址。优先级：
 *   运行时/内置覆盖（override.ts，可 OTA 推送）> 构建期 EXPO_PUBLIC_LICENSE_URL > 默认占位。
 * 用 getter 而非常量，保证每次取值都走当前覆盖（支持迁移时改地址）。
 */
function resolveBaseUrl(): string {
  return licenseUrlOverride() ?? process.env.EXPO_PUBLIC_LICENSE_URL ?? DEFAULT_BASE_URL;
}

export const LICENSE_CONFIG = {
  get baseUrl(): string {
    return resolveBaseUrl();
  },
  productKey: process.env.EXPO_PUBLIC_LICENSE_PRODUCT_KEY ?? "FILL_PRODUCT_KEY",
  productSecret: process.env.EXPO_PUBLIC_LICENSE_PRODUCT_SECRET ?? "FILL_PRODUCT_SECRET",
};

/** 配置是否已填好（未填时门禁会提示）。校验规则见 releaseCheck（构建期脚本共用）。 */
export function licenseConfigured(): boolean {
  return releaseConfigErrors(LICENSE_CONFIG).length === 0;
}
