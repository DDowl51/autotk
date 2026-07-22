import { createSign } from "node:crypto";

/**
 * 用 RSA-SHA256（PKCS#1 v1.5）对 manifest 字符串签名，返回 expo-updates 期望的
 * `expo-signature` 结构化头值：`sig="<base64>", keyid="<id>", alg="rsa-v1_5-sha256"`。
 * 客户端用打进 App 的 certificate.pem 里的公钥验签——只有本服务（持私钥）签过的更新才会被执行。
 */
export function signManifest(manifestString: string, privateKeyPem: string, keyid = "main"): string {
  const signer = createSign("RSA-SHA256");
  signer.update(manifestString, "utf8");
  signer.end();
  const sig = signer.sign(privateKeyPem, "base64");
  return `sig="${sig}", keyid="${keyid}", alg="rsa-v1_5-sha256"`;
}
