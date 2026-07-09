// 【隐藏 · 迁移开关】license 激活服务器地址的运行时覆盖入口。
//
// 为什么要它：正式包里 license 地址来自 EXPO_PUBLIC_LICENSE_URL，是**打包时内联**的常量。
// 想在不重新出原生包的前提下换地址（先用 IP、后期改域名 / 换 IP），就需要一个能被
// **OTA（expo-updates 推 JS 包）**带走的运行时覆盖。改地址是纯 JS 改动、runtimeVersion 不变，
// 所以天然可 OTA。
//
// 怎么用（迁移时）：
//   1) 把下面 BUILTIN_OVERRIDE 改成新地址（如 "https://license.你的域名.com" 或 "http://1.2.3.4:3001"）；
//   2) 在 apps/mobile 跑 `expo export`（带上正确 env）导出新 JS 包；
//   3) 发到你的自建更新服务器；手机**冷启动**拉到新包后，激活地址即切到新值。
//
// 隐藏：不接任何买家可见 UI，只在代码里改（BUILTIN_OVERRIDE），
//   或由 setLicenseUrlOverride() 在运行时注入（预留给调试手势 / 管理中心 Hub 下发）。
// 空 = 不覆盖，回退到 EXPO_PUBLIC_LICENSE_URL / 默认。

/** 代码内置的覆盖地址。迁移时改这一行 → expo export → OTA 推送即可生效。 */
const BUILTIN_OVERRIDE = "";

// 运行时注入的覆盖（优先于内置常量；默认无）。预留给将来从安全存储 / Hub 下发。
let runtimeOverride: string | null = null;

/** 去掉末尾多余斜杠，避免与 SDK 拼接路径时出现双斜杠。 */
function normalize(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * 运行时设置覆盖地址（隐藏入口：调试手势 / Hub 下发时调用）。
 * 传空串 / null 则清除运行时覆盖，回退到内置常量或 env。
 * 注意：只影响此后新建的 LicenseClient——OTA 场景靠冷启动重建，天然生效。
 */
export function setLicenseUrlOverride(url: string | null): void {
  runtimeOverride = url && url.trim() ? normalize(url) : null;
}

/** 当前生效的覆盖地址；无覆盖返回 null（运行时注入优先于内置常量）。 */
export function licenseUrlOverride(): string | null {
  if (runtimeOverride) return runtimeOverride;
  const b = BUILTIN_OVERRIDE.trim();
  return b ? normalize(b) : null;
}
