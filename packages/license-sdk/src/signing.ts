import { sha256 } from "js-sha256";

export interface SignParts {
  productKey: string;
  timestamp: number;
  nonce: string;
  body: string;
}

/**
 * 客户端 HMAC-SHA256 请求签名。用纯 JS 的 js-sha256（RN/浏览器/Node 通用，不依赖 Web Crypto）。
 * 必须与服务端（node:crypto）的 signRequest 逐字节一致：payload = productKey\ntimestamp\nnonce\nbody。
 */
export function signRequest(secret: string, p: SignParts): string {
  const payload = `${p.productKey}\n${p.timestamp}\n${p.nonce}\n${p.body}`;
  return sha256.hmac(secret, payload);
}

/** 生成一次性 nonce（配合时间戳防重放）。 */
export function makeNonce(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
