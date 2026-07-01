#!/usr/bin/env node
// 发布前校验：交付版必须由环境变量填好激活服务配置，禁止 FILL_/占位符被打进包。
// 在 `expo prebuild` / EAS 构建前跑：`npm run check:release`（未配置则 exit 1，中止构建）。
// 规则与 src/license/releaseCheck.ts 一致（此脚本为 .mjs，无法直接 import .ts，故内联同一规则）。

const cfg = {
  baseUrl: process.env.EXPO_PUBLIC_LICENSE_URL ?? "",
  productKey: process.env.EXPO_PUBLIC_LICENSE_PRODUCT_KEY ?? "",
  productSecret: process.env.EXPO_PUBLIC_LICENSE_PRODUCT_SECRET ?? "",
};

const errors = [];
if (!cfg.baseUrl || cfg.baseUrl.includes("your-license-server")) {
  errors.push("EXPO_PUBLIC_LICENSE_URL 未设置或仍是占位地址");
}
if (!cfg.productKey || cfg.productKey.startsWith("FILL_")) {
  errors.push("EXPO_PUBLIC_LICENSE_PRODUCT_KEY 未设置或仍是 FILL_ 占位");
}
if (!cfg.productSecret || cfg.productSecret.startsWith("FILL_")) {
  errors.push("EXPO_PUBLIC_LICENSE_PRODUCT_SECRET 未设置或仍是 FILL_ 占位");
}

if (errors.length > 0) {
  console.error("✗ 发布配置校验未通过：");
  for (const e of errors) console.error("  - " + e);
  console.error("请在 .env 或构建环境里设置好这些变量后再构建（避免占位符被打进交付包）。");
  process.exit(1);
}

console.log("✓ 发布配置校验通过");
