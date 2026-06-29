// Vendored from license-saas/packages/sdk/src/signing.ts —— 保持同步。
// 纯 JS HMAC（js-sha256），RN/Hermes 可跑；与服务端 node:crypto 逐字节一致。
import { sha256 } from "js-sha256";

export interface SignParts {
  productKey: string;
  timestamp: number;
  nonce: string;
  body: string;
}

export function signRequest(secret: string, p: SignParts): string {
  const payload = `${p.productKey}\n${p.timestamp}\n${p.nonce}\n${p.body}`;
  return sha256.hmac(secret, payload);
}

export function makeNonce(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
