import {
  activateApp,
  applyFastSettings,
  createSession,
  getSessionId,
  swipe,
  tap,
  typeText,
  windowSize,
  TIKTOK_BUNDLE_ID,
  type Point,
} from "../src/wda";
import type { TikTokUI, VideoInfo, CommentInfo } from "../src/engine/tiktok-ui";
import { deviceKey, loadProfile, type DeviceProfile } from "./deviceProfile";
import {
  detectFollow,
  detectCommentCloseButton,
  detectCommentHearts,
  detectSendButton,
} from "./railDetect";
import { readCaption } from "./ocr";

type Log = (msg: string) => void;

const NOT_ADAPTED = (name: string): never => {
  throw new Error(`${name} 尚未适配（需要对应界面标定/读取能力）`);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 我们建模的 TikTok 页面（操作集合不同的界面）。 */
type Page = "feed" | "comments";

/**
 * 用标定坐标 + 截图检测驱动 TikTok 的 TikTokUI 实现（电脑驱动调试台用）。
 *
 * 内置一个轻量「页面状态机」：跟踪当前在哪个页面（feed=推荐/结果视频流，
 * comments=评论区），每个动作执行前 goTo(它需要的页)，不一致就先转过去。
 * goTo("feed") 兜底：回 feed 时关掉评论面板（在才关），提供基本脱困能力。
 * 后续加新页面（个人主页/搜索框等）只需扩展 Page 与 goTo 的转换。
 */
export function createCalibratedUI(log: Log): TikTokUI {
  let size = { width: 390, height: 844 };
  let prof: DeviceProfile | null = null;
  let page: Page = "feed";
  // listComments 检测到的评论爱心坐标，供 likeComment 按 index 点击。
  let heartCache: Point[] = [];

  const ensure = async () => {
    if (!getSessionId()) {
      await createSession();
      await applyFastSettings();
    }
    await activateApp(TIKTOK_BUNDLE_ID);
    if (!prof) {
      size = await windowSize();
      prof = loadProfile(deviceKey(size.width, size.height));
      if (!prof) {
        throw new Error(
          `本机型 [${deviceKey(size.width, size.height)}] 未标定，请先用 calibrate 标定`,
        );
      }
    }
  };

  // —— 原子转换动作（只点击/滑动，不改 page）——
  const rawOpenComments = async () => {
    await tap(prof!.comment);
    await sleep(900); // 等评论面板上滑动画完成
  };
  const rawCloseComments = async () => {
    // 循环：检测 ✕ → 点 → 再检测。最多 3 次。
    // 空评论区会自动聚焦输入框弹键盘，此时第一次点 ✕ 只收起键盘、面板没关，
    // 需再点一次才真正关闭；正常情况一次就关、第二次检测无 ✕ 直接返回。
    for (let i = 0; i < 3; i++) {
      const x = await detectCommentCloseButton(size.width, size.height);
      if (!x) return; // 已无面板 = 已关闭
      await tap(x);
      await sleep(400);
    }
    // 仍未关：下滑兜底。
    await swipe(
      { x: size.width * 0.5, y: size.height * 0.3 },
      { x: size.width * 0.5, y: size.height * 0.95 },
      0.3,
    );
  };

  /** 页面状态机：转到目标页（必要时执行转换）。 */
  const goTo = async (target: Page) => {
    if (page === target) return;
    if (target === "feed") {
      await rawCloseComments(); // 脱困：检测到面板就关（含空评论键盘态）
      page = "feed";
      log("→ 推荐流");
    } else if (target === "comments") {
      if (page !== "feed") await goTo("feed");
      await rawOpenComments();
      page = "comments";
      log("→ 评论区");
    }
  };

  return {
    async openForYou() {
      await ensure();
      page = "feed"; // 假定启动时在推荐页
      log("已确保 TikTok 在前台（推荐页）");
    },

    async swipeToNextVideo() {
      await ensure();
      await goTo("feed");
      const { width: w, height: h } = size;
      await swipe({ x: w * 0.5, y: h * 0.72 }, { x: w * 0.5, y: h * 0.26 }, 0.25);
      log("上滑切换视频");
    },

    async readCurrentVideo(): Promise<VideoInfo> {
      await ensure();
      await goTo("feed");
      const caption = await readCaption(size.width, size.height);
      const tags = caption
        .split(/\s+/)
        .map((t) => t.replace(/^#/, ""))
        .filter(Boolean);
      log(caption ? `文案：${caption}` : "未识别到文案");
      return { caption, tags };
    },

    async likeVideo() {
      await ensure();
      await goTo("feed");
      await tap(prof!.like);
      log("已点赞");
    },

    async saveVideo() {
      await ensure();
      await goTo("feed");
      await tap(prof!.save);
      log("已收藏");
    },

    async followAuthor() {
      await ensure();
      await goTo("feed");
      // 实时检测红 +：在才点（已关注作者无 +，点了会跳进主页）。
      const f = await detectFollow(size.width, size.height, prof!.like.y);
      if (!f) {
        log("未检测到关注按钮（已关注），跳过");
        return;
      }
      await tap(f);
      log("已关注作者");
    },

    async openComments() {
      await ensure();
      await goTo("comments");
      log("已打开评论区");
    },

    async closeComments() {
      await ensure();
      await goTo("feed");
      log("已关闭评论区");
    },

    async listComments(): Promise<CommentInfo[]> {
      await ensure();
      await goTo("comments");
      // 检测评论爱心位置（运行时检测，因评论长度不一）。文本暂读不了，留空。
      heartCache = await detectCommentHearts(size.width, size.height);
      return heartCache.map((_, i) => ({ index: i, text: "" }));
    },

    async likeComment(c: CommentInfo) {
      const p = heartCache[c.index];
      if (!p) return;
      await tap(p);
      log(`已赞评论 ${c.index + 1}`);
    },

    async replyComment(_c: CommentInfo, text: string) {
      await ensure();
      await goTo("comments");
      // 通过底部输入框发评论（暂发顶层评论，非针对具体评论的回复；文案由生成器给）。
      await tap({ x: size.width * 0.28, y: size.height * 0.944 });
      await sleep(800);
      await typeText(text);
      await sleep(600);
      const send = await detectSendButton(size.width, size.height);
      if (!send) return log("未检测到发送按钮，跳过回复");
      await tap(send);
      log(`已发评论：${text}`);
    },

    // —— 搜索：桥接到「结果是可上滑视频流」的现实 ——
    async search(keyword: string) {
      await ensure();
      await goTo("feed");
      const { width: W, height: H } = size;
      await tap({ x: W - 28, y: 69 }); // 放大镜
      await sleep(1000);
      await typeText(keyword);
      await sleep(700);
      await tap({ x: W - 43, y: 69 }); // 红色 Search 提交
      await sleep(10000); // 等结果加载
      await tap({ x: W * 0.25, y: H * 0.255 }); // 打开第一个结果，进入结果视频流
      await sleep(1500);
      page = "feed"; // 结果视频流与推荐页操作相同，视作 feed
      log(`已搜索「${keyword}」并进入结果视频流`);
    },
    // 结果是连续视频流，没有确切总数；返回一个批量数，由调用方上限裁剪。
    countSearchResults: async () => 8,
    async openSearchResult(index: number) {
      await ensure();
      await goTo("feed");
      // 第一个结果在 search() 里已打开；之后靠上滑切到下一个。
      if (index > 0) {
        await swipe(
          { x: size.width * 0.5, y: size.height * 0.72 },
          { x: size.width * 0.5, y: size.height * 0.26 },
          0.25,
        );
      }
    },
    back: async () => {
      // 结果视频流里无需返回网格（靠上滑前进），空操作。
    },

    openOwnProfile: () => NOT_ADAPTED("openOwnProfile"),
    listOwnVideos: () => NOT_ADAPTED("listOwnVideos"),
    openOwnVideo: () => NOT_ADAPTED("openOwnVideo"),

    async detectPopup() {
      return false;
    },
  };
}
