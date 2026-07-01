import type { AutomationParams } from "./types";

/**
 * 参数深合并（供「Hub 配置下发」与「本地持久化加载」共用）。
 * 语义：对象逐层合并；数组与基础类型整体替换；patch 里 undefined 的键跳过。
 * 用于加载时把「旧存档」合并到 DEFAULT_PARAMS 上，保证新增字段拿到默认值。
 */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function mergeDeep<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? mergeDeep(out[k], v) : v;
  }
  return out as T;
}

/** 把任意（可能是旧版/部分）参数对象合并到一份完整基准上，补齐缺失字段。 */
export function mergeParams(base: AutomationParams, partial: unknown): AutomationParams {
  return mergeDeep(base, partial);
}
