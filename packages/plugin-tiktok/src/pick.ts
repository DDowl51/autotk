// 批次模块选择(L3 §3.2-5 互斥优先级;无 For You 后 groom=search,总纲 §8):
//   following 开 = 纯打粉,与一切养号互斥
//   否则 persHome 开且今天没跑过 = 主页+私信(每日一次,选中即被 core 标记「先写 key 再执行」)
//   否则有搜索词 = search;啥都没配 = null(睡 IDLE_POLL)
import type { WorkflowPicker } from "@auto/core";
import type { TikTokParams } from "./params";

/** 每日至多一次的工作流(交给 core 的 oncePerDay)。 */
export const ONCE_PER_DAY = ["profileAndDM"];

export const pickWorkflow: WorkflowPicker = (params, view) => {
  const p = params as TikTokParams;
  if (p.following.moduleEnable) return "followMonitor";
  if (p.persHome.moduleEnable && !view.ranToday("profileAndDM")) return "profileAndDM";
  if (p.searchKeywords.length > 0) return "search";
  return null;
};
