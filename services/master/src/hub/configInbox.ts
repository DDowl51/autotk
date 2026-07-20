// ConfigPatch(Hub 批量下发)→ 应用到某台的 params/schedule。纯函数,可测。
// ConfigPatch 与 TikTokParams 模块结构 1:1(见 shared/protocol.ts),深合并即可;
// 唯 allDay/taskWindows 属 schedule(Fleet 的 PhoneConfig.schedule),路由过去,不进 params。
import type { ConfigPatch } from "@mc/shared";
import type { Schedule } from "@auto/core";
import { deepMerge } from "../config";

export interface AppliedConfig {
  /** 有 params 字段变更时给出深合并后的新 params(交 PhoneHandle.updateParams 校验生效)。 */
  params?: unknown;
  /** 有 allDay/taskWindows 变更时给出新 schedule(交 PhoneHandle.updateSchedule)。 */
  schedule?: Schedule;
}

export function applyConfigPatch(currentParams: unknown, currentSchedule: Schedule, patch: ConfigPatch): AppliedConfig {
  const paramPatch: Record<string, unknown> = {};
  let hasParam = false;
  let hasSchedule = false;
  let allDay = currentSchedule.allDay;
  let windows = currentSchedule.windows;

  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (k === "allDay") {
      allDay = v as boolean;
      hasSchedule = true;
    } else if (k === "taskWindows") {
      windows = v as Schedule["windows"];
      hasSchedule = true;
    } else {
      paramPatch[k] = v;
      hasParam = true;
    }
  }

  const out: AppliedConfig = {};
  if (hasParam) out.params = deepMerge(currentParams, paramPatch);
  if (hasSchedule) out.schedule = { allDay, windows };
  return out;
}
