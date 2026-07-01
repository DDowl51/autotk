import type { AutomationParams } from "./types";
import { DEFAULT_PARAMS } from "./defaults";
import { mergeParams } from "./merge";

/**
 * 设置持久化的纯逻辑（不碰存储/原生模块，便于 node:test）。
 * IO 包装见 `src/app/paramsStorage.ts`。
 *
 * 设计取舍：
 * - 加载**宽容**：解析失败/非对象 → 回退默认；能解析就合并到 DEFAULT_PARAMS 上
 *   （补齐版本升级后新增的字段，如 following），旧存档不会因缺字段而崩。
 * - **不在加载时强校验**：用户存过的设置一律保留，合法性仍由「启动」时的
 *   validateParams 把关（与现有行为一致），避免因一个越界值把整份设置丢掉。
 */

/** 把存储里的原始字符串还原成完整参数；任何异常都回退到默认，绝不抛。 */
export function hydrateStoredParams(raw: string | null | undefined): AutomationParams {
  if (!raw) return DEFAULT_PARAMS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_PARAMS;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return DEFAULT_PARAMS;
  }
  return mergeParams(DEFAULT_PARAMS, parsed);
}

/** 序列化参数以写入存储。 */
export function serializeParams(p: AutomationParams): string {
  return JSON.stringify(p);
}
