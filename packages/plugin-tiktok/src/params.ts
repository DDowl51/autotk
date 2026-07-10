// TikTok 业务参数(语义见 docs/specs/L3-业务规格.md;G3 先落搜索所需子集,四模块/DM 在 G4 补全)。

/** 单模块互动参数(视频级三概率 + 评论互动;G3 用视频级)。 */
export interface ModuleParams {
  interactEnable: boolean;
  interactProb: number;
  videoLikeProb: number;
  videoSaveProb: number;
  videoFollowProb: number;
  commentLikeProb: number;
  commentReplyProb: number;
  commentLikeMaxCount: number;
  commentReplyMaxCount: number;
}

export interface TikTokParams {
  searchKeywords: string[];
  posPrompts: string[];
  negPrompts: string[];
  commentMatchKeywords: string[];
  fixedReplies: string[];
  kwSearchExecRatio: number;
  clickWaitTime: number;
  postReplies: boolean;
  forYou: ModuleParams;
  kwSearch: ModuleParams;
}

const MOD_KEYS: (keyof ModuleParams)[] = [
  "interactEnable",
  "interactProb",
  "videoLikeProb",
  "videoSaveProb",
  "videoFollowProb",
  "commentLikeProb",
  "commentReplyProb",
  "commentLikeMaxCount",
  "commentReplyMaxCount",
];
const PROB_KEYS: (keyof ModuleParams)[] = [
  "interactProb",
  "videoLikeProb",
  "videoSaveProb",
  "videoFollowProb",
  "commentLikeProb",
  "commentReplyProb",
];
const MAX_COMMENT_LIKE = 30;
const MAX_COMMENT_REPLY = 10;

function mod(over: Partial<ModuleParams>): ModuleParams {
  return {
    interactEnable: true,
    interactProb: 0.5,
    videoLikeProb: 0.3,
    videoSaveProb: 0.1,
    videoFollowProb: 0.1,
    commentLikeProb: 0.5,
    commentReplyProb: 0.2,
    commentLikeMaxCount: 4,
    commentReplyMaxCount: 2,
    ...over,
  };
}

/** 默认参数(防风控值,勿回调)。 */
export const defaultParams: TikTokParams = {
  searchKeywords: [],
  posPrompts: ["*"],
  negPrompts: [],
  commentMatchKeywords: [],
  fixedReplies: [],
  kwSearchExecRatio: 0,
  clickWaitTime: 1,
  postReplies: false,
  forYou: mod({}),
  kwSearch: mod({ interactProb: 0.45, videoLikeProb: 0.5, videoSaveProb: 0.3, videoFollowProb: 0.3, commentReplyProb: 0.3, commentLikeMaxCount: 5 }),
};

const isProb = (v: number): boolean => typeof v === "number" && v >= 0 && v <= 1;

/** 校验(防呆,不合法抛错)。 */
export function validateParams(p: unknown): void {
  const q = p as TikTokParams;
  if (!isProb(q.kwSearchExecRatio)) throw new Error("kwSearchExecRatio 必须在 [0,1]");
  if (!(q.clickWaitTime > 0)) throw new Error("clickWaitTime 必须 > 0");
  if (q.kwSearchExecRatio > 0 && (!q.searchKeywords || q.searchKeywords.length === 0)) {
    throw new Error("启用了搜索页(kwSearchExecRatio>0),但未设置任何搜索关键词");
  }
  for (const name of ["forYou", "kwSearch"] as const) {
    const m = q[name];
    if (!m) throw new Error(`缺少模块参数: ${name}`);
    void MOD_KEYS;
    for (const k of PROB_KEYS) {
      if (!isProb(m[k] as number)) throw new Error(`${name}.${k} 必须在 [0,1]`);
    }
    if (m.commentLikeMaxCount < 0 || m.commentLikeMaxCount > MAX_COMMENT_LIKE) throw new Error(`${name}.commentLikeMaxCount 过大或为负(防封号)`);
    if (m.commentReplyMaxCount < 0 || m.commentReplyMaxCount > MAX_COMMENT_REPLY) throw new Error(`${name}.commentReplyMaxCount 过大或为负(防封号)`);
  }
}
