import type { ConfigPatch } from "@mc/shared";

// 批量下发操作日志（审计）：记录每次下发了哪些组、到多少台、结果如何。持久化到 localStorage。

export interface ConfigOp {
  jobId: string;
  ts: number;
  deviceCount: number;
  groups: string[]; // 下发的分组中文名（如 推荐页/搜索页/时间）
  patch: ConfigPatch; // 原始补丁，用于展开「改了哪些内容」
  ok: number;
  failed: number;
  offline: number;
  timeout: number;
  pending: number;
}

// —— 把补丁展开成「字段 → 值」的可读清单（点开历史记录看改了什么）——

const TOP_LABELS: Record<string, string> = {
  searchKeywords: "搜索关键词",
  posPrompts: "正向词",
  negPrompts: "反向词",
  commentMatchKeywords: "评论匹配词",
  fixedReplies: "固定回复",
  kwSearchExecRatio: "搜索互动占比",
  clickWaitTime: "点赞间隔",
  postReplies: "真实发送回复",
  allDay: "全天运行",
};
const MODULE_NAMES: Record<string, string> = { forYou: "推荐页", kwSearch: "搜索页", persHome: "个人主页" };
const MODULE_FIELDS: Record<string, string> = {
  interactEnable: "评论区互动",
  interactProb: "进评论区概率",
  videoLikeProb: "点赞概率",
  videoSaveProb: "收藏概率",
  videoFollowProb: "关注概率",
  commentLikeProb: "单条评论点赞概率",
  commentReplyProb: "单条评论回复概率",
  commentLikeMaxCount: "评论点赞上限",
  commentReplyMaxCount: "评论回复上限",
  moduleEnable: "启用模块",
  maxVideoCount: "互动作品数",
};

function fmtVal(key: string, v: unknown): string {
  if (Array.isArray(v)) return v.length ? v.join(" / ") : "（空）";
  if (typeof v === "boolean") return v ? "开" : "关";
  if (typeof v === "number") return /Prob|Ratio/.test(key) ? `${Math.round(v * 100)}%` : String(v);
  return String(v);
}

export interface ChangeLine {
  label: string;
  value: string;
}

export interface PatchGroup {
  group: string;
  items: ChangeLine[];
}

// 「时间」分组里的全局节奏字段（在手机端也归在「时间」页）。
const TIME_KEYS = new Set(["kwSearchExecRatio", "clickWaitTime", "postReplies", "allDay"]);
const GROUP_ORDER = ["关键词", "推荐页", "搜索页", "个人主页", "时间"];

/**
 * 把 ConfigPatch 按手机端分页(关键词/推荐页/搜索页/个人主页/时间)归组，
 * 只返回有改动的组，供「下发记录」详情用折叠面板分组展示（改动多时不至于一长串）。
 */
export function groupPatch(patch: ConfigPatch): PatchGroup[] {
  const buckets: Record<string, ChangeLine[]> = {};
  const push = (group: string, label: string, value: string) => {
    (buckets[group] ||= []).push({ label, value });
  };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (k in MODULE_NAMES) {
      for (const [mk, mv] of Object.entries(v as Record<string, unknown>)) {
        if (mv === undefined) continue;
        push(MODULE_NAMES[k], MODULE_FIELDS[mk] ?? mk, fmtVal(mk, mv));
      }
    } else if (k === "taskWindows") {
      push("时间", "任务时间段", (v as Array<{ start: string; end: string }>).map((w) => `${w.start}~${w.end}`).join("，"));
    } else if (TIME_KEYS.has(k)) {
      push("时间", TOP_LABELS[k] ?? k, fmtVal(k, v));
    } else {
      push("关键词", TOP_LABELS[k] ?? k, fmtVal(k, v));
    }
  }
  return GROUP_ORDER.filter((g) => buckets[g]?.length).map((g) => ({ group: g, items: buckets[g] }));
}

export interface OpResult {
  ok: number;
  failed: number;
  offline: number;
  timeout: number;
  pending: number;
}

const CAP = 50;
const KEY = "mc.configHistory";

/** 从补丁推断「改了哪些组」的中文名（用于审计描述）。 */
export function describePatchGroups(patch: ConfigPatch): string[] {
  const g = new Set<string>();
  if (
    patch.searchKeywords ||
    patch.posPrompts ||
    patch.negPrompts ||
    patch.commentMatchKeywords ||
    patch.fixedReplies
  )
    g.add("关键词");
  if (patch.forYou) g.add("推荐页");
  if (patch.kwSearch) g.add("搜索页");
  if (patch.persHome) g.add("个人主页");
  if (patch.allDay !== undefined || patch.taskWindows) g.add("时间");
  if (patch.clickWaitTime !== undefined || patch.kwSearchExecRatio !== undefined || patch.postReplies !== undefined)
    g.add("全局");
  return [...g];
}

export function addOp(list: ConfigOp[], op: ConfigOp, cap = CAP): ConfigOp[] {
  return [op, ...list].slice(0, cap);
}

/** 用最新进度汇总更新某条记录（jobId 不存在则原样返回）。 */
export function updateOpResult(list: ConfigOp[], jobId: string, r: OpResult): ConfigOp[] {
  let changed = false;
  const next = list.map((o) => {
    if (o.jobId !== jobId) return o;
    changed = true;
    return { ...o, ...r };
  });
  return changed ? next : list;
}

export function loadHistory(): ConfigOp[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveHistory(list: ConfigOp[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, CAP)));
  } catch {
    /* 忽略持久化失败 */
  }
}
