#!/usr/bin/env node
// 发布前校验：交付版必须由 .env / 环境变量填好激活服务配置，禁止 FILL_/占位符被打进包。
// 在 `expo prebuild` / EAS 构建前跑：`npm run check:release`（未配置则 exit 1，中止构建）。
// 规则与 src/license/releaseCheck.ts 一致（此脚本为 .mjs，无法直接 import .ts，故内联同一规则）。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// 与 Expo 打包一致地加载同目录 .env（EXPO_PUBLIC_* 构建时会被内联进 JS）——
// 本脚本是裸 node，不像 expo 命令会自动读 .env，故手动读一次，
// 避免「.env 已填好但 check:release 仍报未设置」。已在真实环境里的变量优先、不覆盖。
try {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
} catch {
  /* 没有 .env 就依赖真实环境变量 */
}

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
