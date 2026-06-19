// TikTok 高层界面动作抽象。
//
// 这是「决策引擎」与「机型/版本适配」之间的边界：
//   - 上层（modules/*）只关心「该不该点赞、该回复哪条评论」这类业务决策；
//   - 下层负责「点赞按钮在哪、评论文本是什么」——这部分依赖具体机型与 TikTok 版本，
//     由 WDA 元素树 + Vision OCR 实现，是后续机型适配阶段的工作。
//
// 因此本文件只定义接口与一个明确抛错的桩实现，决策逻辑可独立开发与测试。

export interface VideoInfo {
  caption: string;
  tags: string[];
}

export interface CommentInfo {
  /** 评论在当前可视列表中的索引。 */
  index: number;
  text: string;
}

export interface TikTokUI {
  // —— 推荐页 ——
  openForYou(): Promise<void>;
  swipeToNextVideo(): Promise<void>;
  readCurrentVideo(): Promise<VideoInfo>;

  // —— 视频级互动 ——
  likeVideo(): Promise<void>;
  saveVideo(): Promise<void>;
  followAuthor(): Promise<void>;

  // —— 评论区 ——
  openComments(): Promise<void>;
  listComments(): Promise<CommentInfo[]>;
  likeComment(c: CommentInfo): Promise<void>;
  replyComment(c: CommentInfo, text: string): Promise<void>;
  closeComments(): Promise<void>;

  // —— 搜索页 ——
  search(keyword: string): Promise<void>;
  /** 当前搜索结果数量（用于遍历）。 */
  countSearchResults(): Promise<number>;
  openSearchResult(index: number): Promise<void>;
  back(): Promise<void>;

  // —— 个人主页 ——
  openOwnProfile(): Promise<void>;
  listOwnVideos(): Promise<number>;
  openOwnVideo(index: number): Promise<void>;

  // —— 风控 ——
  /** 检测是否出现需要人工干预的弹窗/验证。 */
  detectPopup(): Promise<boolean>;
}

class NotAdaptedError extends Error {
  constructor(method: string) {
    super(`TikTokUI.${method} 尚未实现（待机型适配阶段接入 WDA 元素树 + OCR）`);
    this.name = "NotAdaptedError";
  }
}

/**
 * 桩实现：所有方法抛 NotAdaptedError。
 * 用于在没有真机/适配的情况下，对上层决策逻辑做结构性开发与单测。
 */
export function createStubUI(): TikTokUI {
  const stub = (name: string) => async (): Promise<never> => {
    throw new NotAdaptedError(name);
  };
  return {
    openForYou: stub("openForYou"),
    swipeToNextVideo: stub("swipeToNextVideo"),
    readCurrentVideo: stub("readCurrentVideo"),
    likeVideo: stub("likeVideo"),
    saveVideo: stub("saveVideo"),
    followAuthor: stub("followAuthor"),
    openComments: stub("openComments"),
    listComments: stub("listComments"),
    likeComment: stub("likeComment"),
    replyComment: stub("replyComment"),
    closeComments: stub("closeComments"),
    search: stub("search"),
    countSearchResults: stub("countSearchResults"),
    openSearchResult: stub("openSearchResult"),
    back: stub("back"),
    openOwnProfile: stub("openOwnProfile"),
    listOwnVideos: stub("listOwnVideos"),
    openOwnVideo: stub("openOwnVideo"),
    detectPopup: stub("detectPopup"),
  };
}
