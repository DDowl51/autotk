// 激活码系统接入配置。
// productKey/secret 在 license 管理后台「产品」页创建产品时拿到（secret 只显示一次）。
// 注意：secret 会被打进客户端包内，属可被提取的明文——这是纯客户端方案的固有上限，
// 配合服务端设备绑定 + 心跳 + 远程封禁构成防破解基线。要更强可对 secret 做混淆/加固。
//
// 可用 EXPO_PUBLIC_* 环境变量在构建时覆盖（写进 .env，expo 会内联）。
export const LICENSE_CONFIG = {
  baseUrl: process.env.EXPO_PUBLIC_LICENSE_URL ?? "https://your-license-server.example.com",
  productKey: process.env.EXPO_PUBLIC_LICENSE_PRODUCT_KEY ?? "FILL_PRODUCT_KEY",
  productSecret: process.env.EXPO_PUBLIC_LICENSE_PRODUCT_SECRET ?? "FILL_PRODUCT_SECRET",
};

/** 配置是否已填好（未填时门禁会提示）。 */
export function licenseConfigured(): boolean {
  return (
    !LICENSE_CONFIG.baseUrl.includes("your-license-server") &&
    !LICENSE_CONFIG.productKey.startsWith("FILL_") &&
    !LICENSE_CONFIG.productSecret.startsWith("FILL_")
  );
}
