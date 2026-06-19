/**
 * 自动化运行参数 schema。
 *
 * 这是用户在配置界面里设置、并驱动整个决策引擎的全部参数。
 * 字段命名与原版参数 JSON 保持一致，方便沿用既有的参数文档与用户习惯，
 * 但这里是我们自研的、强类型的版本。
 *
 * 概率类字段取值范围均为 [0, 1]；次数/时间类为非负数。
 */

/** 一个任务时间段（设备本地时间，24 小时制 "HH:MM:SS"）。 */
export interface TaskWindow {
  start: string;
  end: string;
}

/** 单个互动模块（推荐页 / 搜索页 / 个人主页）的互动参数。 */
export interface ModuleInteractionParams {
  /** 是否开启该模块的评论区互动（点赞 + 回复）。 */
  interactEnable: boolean;
  /** 命中视频后，进入评论区互动的概率。 */
  interactProb: number;
  /** 视频点赞概率。 */
  videoLikeProb: number;
  /** 视频收藏概率。 */
  videoSaveProb: number;
  /** 视频关注作者概率。 */
  videoFollowProb: number;
  /** 评论区中给单条评论点赞的概率。 */
  commentLikeProb: number;
  /** 单个视频评论区最多给多少条评论点赞。 */
  commentLikeMaxCount: number;
  /** 单个视频评论区最多回复多少条评论。 */
  commentReplyMaxCount: number;
}

export interface AutomationParams {
  // —— 关键词与提示词 ——
  /** 搜索关键词列表（用于搜索页）。 */
  searchKeywords: string[];
  /** 正向提示词：推荐页命中则观看/互动。 */
  posPrompts: string[];
  /** 反向提示词：推荐页命中则立即划走。 */
  negPrompts: string[];

  // —— 全局开关与占比 ——
  /** 搜索页互动的总运行时间占比 [0,1]，其余时间留给推荐页。 */
  kwSearchExecRatio: number;
  /** 评论回复使用的语言（"英文" / "中文" / ... 支持任意语言）。 */
  language: string;
  /** 每次点赞动作之间的间隔时间（秒）。 */
  clickWaitTime: number;

  // —— 三大互动模块 ——
  forYou: ModuleInteractionParams;
  kwSearch: ModuleInteractionParams;
  persHome: ModuleInteractionParams & {
    /**
     * 个人主页模块总开关（原版 is_run_pers_home_vid_int）。
     * 账号未发布任何作品时必须为 false。每天最多运行一次。
     */
    moduleEnable: boolean;
    /** 进入个人主页后，对多少条自己的作品进行互动。 */
    maxVideoCount: number;
  };

  // —— 分时段调度 ——
  /** 任务时间段（原版固定 4 段，这里允许 1..N 段，按时间排序、互不重叠）。 */
  taskWindows: TaskWindow[];
}
