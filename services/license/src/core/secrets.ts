import { randomBytes } from "node:crypto";

/** 产品公开标识，如 prod_1a2b3c...（客户端用，可公开）。 */
export function generateProductKey(prefix = "prod"): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

/** 产品签名密钥（HMAC secret，仅服务端持有）。 */
export function generateSecret(): string {
  return randomBytes(32).toString("hex");
}
