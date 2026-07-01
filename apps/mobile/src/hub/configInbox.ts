import type { AutomationParams } from "../params/types";
import { validateParams } from "../params/parse";
import { mergeDeep } from "../params/merge";
import type { ConfigPatch } from "./protocol";

/**
 * 批量配置下发的「手机接收侧」核心：把 Hub 下发的 ConfigPatch 深合并进当前参数并校验。
 * 纯函数、不碰网络/存储，便于单测。useEngine 负责把结果落库 + 喂给引擎 + 回执 Hub。
 * 深合并逻辑抽到 `../params/merge`，与本地持久化加载共用。
 */

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
