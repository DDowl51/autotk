import { readFileSync } from "node:fs";

export interface Config {
  port: number;
  updatesDir: string;
  /** 对外可访问的基址（含协议+域名，供拼资源绝对地址），如 https://updates.你的域名.com。 */
  baseUrl: string;
  /** 代码签名私钥 PEM（设了则对 manifest 签名；不设则不签，只靠 HTTPS 传输安全）。 */
  privateKeyPem?: string;
  keyid: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const baseUrl = (env.BASE_URL ?? "http://localhost:4200").replace(/\/+$/, "");
  const keyPath = env.CODE_SIGNING_PRIVATE_KEY;
  let privateKeyPem: string | undefined;
  if (keyPath) {
    try {
      privateKeyPem = readFileSync(keyPath, "utf8");
    } catch (e) {
      throw new Error(`读取代码签名私钥失败（CODE_SIGNING_PRIVATE_KEY=${keyPath}）：${(e as Error).message}`);
    }
  }
  return {
    port: Number(env.PORT ?? 4200),
    updatesDir: env.UPDATES_DIR ?? "./updates",
    baseUrl,
    privateKeyPem,
    keyid: env.KEYID ?? "main",
  };
}
