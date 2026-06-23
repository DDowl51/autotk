import type { AutomationParams } from "./types";

/**
 * 默认参数，取值参考原版「互动参数」面板的默认值与示例。
 * 用户首次进入配置界面时以此为基础。
 */
export const DEFAULT_PARAMS: AutomationParams = {
  searchKeywords: [],
  posPrompts: [],
  negPrompts: [],

  kwSearchExecRatio: 0.8,
  language: "英文",
  clickWaitTime: 0.5,

  forYou: {
    interactEnable: true,
    interactProb: 0.5,
    videoLikeProb: 0.3,
    videoSaveProb: 0.1,
    videoFollowProb: 0.1,
    commentLikeProb: 0.5,
    commentReplyProb: 0.2,
    commentLikeMaxCount: 15,
    commentReplyMaxCount: 2,
  },

  kwSearch: {
    interactEnable: true,
    interactProb: 0.8,
    videoLikeProb: 0.5,
    videoSaveProb: 0.3,
    videoFollowProb: 0.3,
    commentLikeProb: 0.6,
    commentReplyProb: 0.3,
    commentLikeMaxCount: 30,
    commentReplyMaxCount: 2,
  },

  persHome: {
    moduleEnable: false,
    interactEnable: false,
    interactProb: 0.1,
    videoLikeProb: 0,
    videoSaveProb: 0,
    videoFollowProb: 0,
    commentLikeProb: 0.5,
    commentReplyProb: 0.5,
    commentLikeMaxCount: 20,
    commentReplyMaxCount: 2,
    maxVideoCount: 3,
  },

  allDay: false,
  taskWindows: [
    { start: "07:00:00", end: "11:00:00" },
    { start: "12:00:00", end: "16:00:00" },
    { start: "17:00:00", end: "22:00:00" },
    { start: "23:00:00", end: "23:59:00" },
  ],
};
