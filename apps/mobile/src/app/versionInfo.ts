// @ts-ignore —— expo-updates 运行时已装（RN/Metro 解析）；类型检查环境（如 Windows）可能没装，忽略「找不到模块」。
import * as Updates from "expo-updates";

const pad = (n: number) => String(n).padStart(2, "0");
function fmt(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 当前运行版本的「发布日期」（OTA 包的 createdAt）+ 运行版本号，供启动自动化流程时打印，
 * 便于一眼确认这台设备跑的是哪一版热更。
 * - OTA 热更版：createdAt = 该更新在服务器上的发布时间；
 * - 内置包（还没被任何 OTA 覆盖）：createdAt 为 null；
 * - Expo Go / expo-updates 取不到：回退「未知」，绝不崩。
 */
export function versionBanner(): string {
  try {
    const U = Updates as unknown as { createdAt: Date | null; runtimeVersion: string | null };
    const rv = U.runtimeVersion ?? "?";
    const d = U.createdAt ? new Date(U.createdAt) : null;
    if (d && !isNaN(d.getTime())) return `📦 当前版本发布：${fmt(d)}（运行版本 ${rv}）`;
    return `📦 当前版本：内置包（尚未 OTA 热更，运行版本 ${rv}）`;
  } catch {
    return "📦 当前版本：未知（expo-updates 不可用）";
  }
}
