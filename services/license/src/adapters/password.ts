import bcrypt from "bcryptjs";
import type { PasswordVerifier } from "../domain/ports";

// 密码哈希。用 bcryptjs（纯 JS，零原生依赖，部署稳）。
// 生产想更强可换 @node-rs/argon2（预编译 argon2），接口一致。

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** PasswordVerifier 端口实现，注入 AuthService。 */
export const passwordVerifier: PasswordVerifier = { verify: verifyPassword };
