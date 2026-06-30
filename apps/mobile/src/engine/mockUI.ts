import type { TikTokUI, VideoInfo, CommentInfo } from "./tiktok-ui";
import { jitterSleep, pick, randInt } from "./random";

type Log = (msg: string) => void;

const SAMPLE_CAPTIONS = [
  "summer bikini haul beachykeen",
  "new swimwear model try on",
  "cute cat compilation",
  "street food tour asmr",
  "bikinilove sunset vibes",
];

/**
 * 演示版 TikTokUI：不连接真实 TikTok，只按真实决策流程「假装」执行动作并打日志。
 * 用于在真机/Expo Go 上验证「配置 → 启动 → 引擎循环 → 日志/统计 → 停止」整条链路。
 *
 * 机型适配阶段用真实实现（WDA 元素树 + OCR）替换它即可，上层业务逻辑无需改动。
 */
export function createMockUI(log: Log): TikTokUI {
  const act = async (msg: string, seconds = 0.4) => {
    log(msg);
    await jitterSleep(seconds);
  };

  let resultCount = 0;

  return {
    openForYou: () => act("打开推荐页"),
    swipeToNextVideo: () => act("上滑到下一个视频", 0.6),
    readCurrentVideo: async (): Promise<VideoInfo> => {
      await jitterSleep(0.3);
      const caption = pick(SAMPLE_CAPTIONS)!;
      return { caption, tags: caption.split(" ") };
    },
    likeVideo: () => act("点赞视频"),
    saveVideo: () => act("收藏视频"),
    followAuthor: () => act("关注作者"),
    openComments: () => act("打开评论区"),
    listComments: async (): Promise<CommentInfo[]> => {
      await jitterSleep(0.3);
      const n = randInt(3, 8);
      return Array.from({ length: n }, (_, i) => ({
        index: i,
        text: `示例评论 #${i + 1}`,
      }));
    },
    likeComment: (c) => act(`  给评论点赞: ${c.text}`),
    replyComment: (c, text) => act(`  回复「${c.text}」: ${text}`),
    closeComments: () => act("关闭评论区"),
    search: (kw) => act(`搜索关键词: ${kw}`),
    countSearchResults: async () => {
      resultCount = randInt(5, 12);
      return resultCount;
    },
    openSearchResult: (i) => act(`打开第 ${i + 1} 个搜索结果`),
    back: () => act("返回上一页"),
    openOwnProfile: () => act("打开个人主页"),
    listOwnVideos: async () => randInt(1, 5),
    openOwnVideo: (i) => act(`打开自己的第 ${i + 1} 条作品`),
    detectPopup: async () => false,
    publishVideo: (assetUri, caption) => act(`发布视频「${caption}」(${assetUri})`, 1),
  };
}

