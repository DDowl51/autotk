import { createHmac, timingSafeEqual } from "node:crypto";

/** 参与签名的固定字段。body 是请求体的规范化字符串（JSON.stringify 后）。 */
export interface SignParts {
  productKey: string;
  timestamp: number; // 毫秒
  nonce: string;
  body: string;
}

/** 用产品 secret 对请求做 HMAC-SHA256 签名（防伪、配合时间戳+nonce 防重放）。 */
export function signRequest(secret: string, p: SignParts): string {
  const payload = `${p.productKey}\n${p.timestamp}\n${p.nonce}\n${p.body}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** 校验签名 + 时间戳未超窗口（默认 5 分钟，防重放）。恒定时间比较防时序攻击。 */
export function verifyRequest(
  secret: string,
  p: SignParts,
  sign: string,
  opts: { maxSkewMs?: number; now?: number } = {},
): boolean {
  const skew = opts.maxSkewMs ?? 5 * 60 * 1000;
  const now = opts.now ?? Date.now();
  if (!Number.isFinite(p.timestamp) || Math.abs(now - p.timestamp) > skew)
    return false;
  const expected = signRequest(secret, p);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sign, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
