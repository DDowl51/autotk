import { randomInt } from "node:crypto";

// 去掉易混字符（0/O、1/I/L）。
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** 生成一个激活码，形如 XXXX-XXXX-XXXX-XXXX（groups 组、每组 perGroup 位）。 */
export function generateCode(groups = 4, perGroup = 4): string {
  const part = () =>
    Array.from({ length: perGroup }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return Array.from({ length: groups }, part).join("-");
}

/** 规范化用户输入的码：去空白、转大写、去分隔符（存库/比对用）。 */
export function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** 把规范化的码加分隔符展示（每 4 位一组）。 */
export function formatCode(normalized: string, perGroup = 4): string {
  return normalized.replace(new RegExp(`(.{${perGroup}})`, "g"), "$1-").replace(/-$/, "");
}
