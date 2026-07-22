import { createHash } from "node:crypto";

/** SHA-256 → url-safe base64（去 padding）。expo-updates 的 asset/launchAsset.hash 用此格式。 */
export function sha256UrlSafeBase64(bytes: Buffer): string {
  return createHash("sha256")
    .update(bytes)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** SHA-256 hex（用于派生更新 id）。 */
export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** 把一段 hex 摘要格式化成 UUID 字符串（8-4-4-4-12），做 expo-updates 的 manifest.id（稳定、可复现）。 */
export function hexToUuid(hex: string): string {
  const h = hex.slice(0, 32).padEnd(32, "0");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
