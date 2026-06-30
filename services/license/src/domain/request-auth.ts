import { verifyRequest } from "../core";

// 客户端给请求带这几个头：
//   x-product-key / x-timestamp(ms) / x-nonce / x-signature(hex)
// 服务端用该产品 secret 验签 + 时间戳防重放。

export type SignatureHeaders = Record<string, string | undefined>;

/** 从请求头取签名字段 + 用产品 secret 校验。缺字段/非法/校验失败 → false。 */
export function verifySignedRequest(
  secret: string,
  headers: SignatureHeaders,
  body: string,
  opts?: { maxSkewMs?: number; now?: number },
): boolean {
  const productKey = headers["x-product-key"];
  const ts = headers["x-timestamp"];
  const nonce = headers["x-nonce"];
  const signature = headers["x-signature"];
  if (!productKey || !ts || !nonce || !signature) return false;
  const timestamp = Number(ts);
  if (!Number.isFinite(timestamp)) return false;
  return verifyRequest(secret, { productKey, timestamp, nonce, body }, signature, opts);
}
