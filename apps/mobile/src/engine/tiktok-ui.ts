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
  /** 评论作者（#3：用于 @ 回复与 {user} 占位符；无则空）。 */
  author?: string;
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

  // —— 脱困 ——
  /**
   * 回到"基地"（推荐流干净状态）。每个批次开始前调用,保证从已知状态出发。
   * 至少应:确保 App 在前台、关掉残留的评论区/面板。返回是否已就绪。
   * 可选——未实现的 UI（mock/桩）由引擎跳过。
   */
  recoverToFeed?(): Promise<boolean>;

  /**
   * 从搜索结果视频流退回推荐流（视频→结果网格→搜索输入→推荐流，需连点左上返回箭头）。
   * 搜索批次结束时调用,避免停在搜索流里让后续推荐页在错的流上养号。可选。
   */
  returnToFeed?(): Promise<void>;

  /**
   * 从个人主页作品全屏退回推荐流（作品全屏→返回箭头→主页网格→点底部 Home tab→推荐流）。
   * persHome 批次结束时调用。与 returnToFeed 路径不同（主页网格是底部 tab，非 pushed 页）。可选。
   */
  returnFromProfile?(): Promise<void>;

  /** 从屏幕左边缘往右滑（iOS 返回手势），用于退出误入的页面。可选。 */
  swipeBack?(): Promise<void>;

  /**
   * 脱困 watchdog：截图判断当前在不在"已知/正常"页面（视频流 / 评论区 / 已知弹窗）。
   * 若是未知页面（误点导致跳走）→ 左滑返回 → 再判断，最多几次。每条视频前调用。可选。
   */
  recoverIfLost?(): Promise<void>;

  /** 当前页面标识（feed/comments/search/profile…），供管理中心上报。可选。 */
  getPage?(): string | undefined;

  // —— 发布（阶段3 文件夹工作流）——
  /**
   * 把相册里的视频发布到 TikTok。assetUri=已入相册的资源标识，caption=文案。
   * 真机实现需标定 TikTok 上传流程坐标（机型适配阶段）。可选——未实现则发布任务直接报失败。
   */
  publishVideo?(assetUri: string, caption: string): Promise<void>;
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
