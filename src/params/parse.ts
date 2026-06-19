import type { AutomationParams, TaskWindow } from "./types";

/**
 * 原版参数 JSON 的扁平结构（snake_case）。
 * 由 Windows 参数辅助工具生成，用户可能直接粘贴过来，因此我们兼容导入。
 * 注意：原版示例里写的是 Python 风格的 True/False，导出为标准 JSON 时应为 true/false。
 */
export interface LegacyParams {
  search_kw?: string;
  pos_prompt?: string;
  neg_prompt?: string;

  kw_search_int_exec_prop?: number;
  language?: string;
  click_wait_time?: number;

  is_run_pers_home_vid_int?: boolean;

  for_you_video_int_enable?: boolean;
  for_you_video_int_prob?: number;
  kw_search_video_int_enable?: boolean;
  kw_search_video_int_prob?: number;
  pers_home_video_int_enable?: boolean;
  pers_home_video_int_prob?: number;

  for_you_comment_click_like_prob?: number;
  kw_search_comment_click_like_prob?: number;
  pers_home_vid_comment_click_like_prob?: number;

  for_you_video_like_prob?: number;
  for_you_video_save_to_favorites_prob?: number;
  for_you_video_follow_prob?: number;
  kw_search_video_like_prob?: number;
  kw_search_video_save_to_favorites_prob?: number;
  kw_search_video_follow_prob?: number;

  for_you_single_video_comment_click_like_count?: number;
  for_you_single_video_comment_reply_count?: number;
  kw_search_single_video_comment_click_like_count?: number;
  kw_search_single_video_comment_reply_count?: number;
  pers_home_single_video_comment_click_like_count?: number;
  pers_home_single_video_comment_reply_count?: number;
  pers_home_vid_int_max_count?: number;

  task_plan1_starttime?: string;
  task_plan1_endtime?: string;
  task_plan2_starttime?: string;
  task_plan2_endtime?: string;
  task_plan3_starttime?: string;
  task_plan3_endtime?: string;
  task_plan4_starttime?: string;
  task_plan4_endtime?: string;
}

/** 把逗号分隔的关键词字符串拆成去空、去空白的数组。 */
function splitList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function num(v: number | undefined, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function bool(v: boolean | undefined, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** 从扁平的原版 JSON 构造结构化的 AutomationParams。 */
export function fromLegacy(p: LegacyParams): AutomationParams {
  const windows: TaskWindow[] = [
    { start: p.task_plan1_starttime, end: p.task_plan1_endtime },
    { start: p.task_plan2_starttime, end: p.task_plan2_endtime },
    { start: p.task_plan3_starttime, end: p.task_plan3_endtime },
    { start: p.task_plan4_starttime, end: p.task_plan4_endtime },
  ]
    .filter((w): w is TaskWindow => Boolean(w.start && w.end));

  return {
    searchKeywords: splitList(p.search_kw),
    posPrompts: splitList(p.pos_prompt),
    negPrompts: splitList(p.neg_prompt),

    kwSearchExecRatio: num(p.kw_search_int_exec_prop, 0.8),
    language: p.language ?? "英文",
    clickWaitTime: num(p.click_wait_time, 0.5),

    forYou: {
      interactEnable: bool(p.for_you_video_int_enable, true),
      interactProb: num(p.for_you_video_int_prob, 0.5),
      videoLikeProb: num(p.for_you_video_like_prob, 0.3),
      videoSaveProb: num(p.for_you_video_save_to_favorites_prob, 0.1),
      videoFollowProb: num(p.for_you_video_follow_prob, 0.1),
      commentLikeProb: num(p.for_you_comment_click_like_prob, 0.5),
      commentLikeMaxCount: num(p.for_you_single_video_comment_click_like_count, 15),
      commentReplyMaxCount: num(p.for_you_single_video_comment_reply_count, 2),
    },

    kwSearch: {
      interactEnable: bool(p.kw_search_video_int_enable, true),
      interactProb: num(p.kw_search_video_int_prob, 0.8),
      videoLikeProb: num(p.kw_search_video_like_prob, 0.5),
      videoSaveProb: num(p.kw_search_video_save_to_favorites_prob, 0.3),
      videoFollowProb: num(p.kw_search_video_follow_prob, 0.3),
      commentLikeProb: num(p.kw_search_comment_click_like_prob, 0.6),
      commentLikeMaxCount: num(p.kw_search_single_video_comment_click_like_count, 30),
      commentReplyMaxCount: num(p.kw_search_single_video_comment_reply_count, 2),
    },

    persHome: {
      moduleEnable: bool(p.is_run_pers_home_vid_int, false),
      interactEnable: bool(p.pers_home_video_int_enable, false),
      interactProb: num(p.pers_home_video_int_prob, 0.1),
      videoLikeProb: 0,
      videoSaveProb: 0,
      videoFollowProb: 0,
      commentLikeProb: num(p.pers_home_vid_comment_click_like_prob, 0.5),
      commentLikeMaxCount: num(p.pers_home_single_video_comment_click_like_count, 20),
      commentReplyMaxCount: num(p.pers_home_single_video_comment_reply_count, 2),
      maxVideoCount: num(p.pers_home_vid_int_max_count, 3),
    },

    taskWindows: windows,
  };
}

const isProb = (v: number) => v >= 0 && v <= 1;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

/** 把 "HH:MM:SS" 转成当天的秒数，便于比较。 */
export function timeToSeconds(t: string): number {
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

/**
 * 校验参数合法性，返回错误信息列表（空数组表示通过）。
 * 时间窗规则同原版：格式合法、各段 start<end、按时间排序且互不重叠。
 */
export function validateParams(p: AutomationParams): string[] {
  const errors: string[] = [];

  const probs: [string, number][] = [
    ["搜索互动占比", p.kwSearchExecRatio],
    ["推荐页互动概率", p.forYou.interactProb],
    ["推荐页点赞概率", p.forYou.videoLikeProb],
    ["推荐页收藏概率", p.forYou.videoSaveProb],
    ["推荐页关注概率", p.forYou.videoFollowProb],
    ["推荐页评论点赞概率", p.forYou.commentLikeProb],
    ["搜索页互动概率", p.kwSearch.interactProb],
    ["搜索页点赞概率", p.kwSearch.videoLikeProb],
    ["搜索页收藏概率", p.kwSearch.videoSaveProb],
    ["搜索页关注概率", p.kwSearch.videoFollowProb],
    ["搜索页评论点赞概率", p.kwSearch.commentLikeProb],
    ["个人主页互动概率", p.persHome.interactProb],
    ["个人主页评论点赞概率", p.persHome.commentLikeProb],
  ];
  for (const [name, v] of probs) {
    if (!isProb(v)) errors.push(`${name} 必须在 0~1 之间（当前 ${v}）`);
  }

  if (p.clickWaitTime < 0) errors.push("点赞间隔时间不能为负");

  if (p.kwSearchExecRatio > 0 && p.searchKeywords.length === 0) {
    errors.push("启用了搜索页互动，但未设置任何搜索关键词");
  }
  if (p.persHome.moduleEnable && p.persHome.maxVideoCount < 1) {
    errors.push("开启了个人主页互动，但最大互动视频数小于 1");
  }

  // —— 时间窗校验 ——
  const ws = p.taskWindows;
  if (ws.length === 0) {
    errors.push("至少需要一个任务时间段");
  }
  let prevEnd = -1;
  ws.forEach((w, i) => {
    const label = `第 ${i + 1} 段`;
    if (!TIME_RE.test(w.start) || !TIME_RE.test(w.end)) {
      errors.push(`${label}时间格式应为 HH:MM:SS`);
      return;
    }
    const s = timeToSeconds(w.start);
    const e = timeToSeconds(w.end);
    if (s >= e) errors.push(`${label}开始时间需早于结束时间`);
    if (s < prevEnd) errors.push(`${label}与上一段时间重叠`);
    prevEnd = Math.max(prevEnd, e);
  });

  return errors;
}
