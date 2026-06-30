import type { AutomationParams } from "../params/types";
import { validateParams } from "../params/parse";
import type { ConfigPatch } from "./protocol";

/**
 * 批量配置下发的「手机接收侧」核心：把 Hub 下发的 ConfigPatch 深合并进当前参数并校验。
 * 纯函数、不碰网络/存储，便于单测。useEngine 负责把结果落库 + 喂给引擎 + 回执 Hub。
 */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 深合并：对象逐层合并；数组与基础类型整体替换；patch 里 undefined 的键跳过。 */
function mergeDeep<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? mergeDeep(out[k], v) : v;
  }
  return out as T;
}

export type ApplyResult =
  | { ok: true; next: AutomationParams }
  | { ok: false; error: string };

/**
 * 应用配置补丁：
 * - 深合并到现有参数的拷贝（不改原对象）；
 * - 复用 validateParams 校验，非法则整体拒绝（不半应用），返回错误串供回执。
 */
export function applyConfigPatch(current: AutomationParams, patch: ConfigPatch): ApplyResult {
  const next = mergeDeep(current, patch);
  const errors = validateParams(next);
  if (errors.length > 0) return { ok: false, error: errors.join("；") };
  return { ok: true, next };
}
