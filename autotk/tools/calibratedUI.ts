import {
  activateApp,
  alertButtons,
  alertClickButton,
  alertDismiss,
  alertText,
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
import { chooseAlertButton } from "../src/engine/alertIntent";
import { deviceKey, loadProfile, type DeviceProfile } from "./deviceProfile";
import {
  detectRail,
  detectFollow,
  detectCommentCloseButton,
  detectCommentHearts,
  detectSendButton,
} from "./railDetect";
import { readCaption } from "./ocr";

type Log = (msg: string) => void;

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
  // 连续"不在正常页面"的次数；避免横屏/图文帖偶发漏检导致在正常视频上误返回。
  let lostStreak = 0;

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

    async swipeBack() {
      await swipe(
        { x: 3, y: size.height * 0.5 },
        { x: size.width * 0.78, y: size.height * 0.5 },
        0.2,
      );
      await sleep(800);
    },

    async recoverIfLost() {
      // 先处理 iOS 系统权限弹窗（WDA alert 接口，按意图表点）。
      const text = await alertText();
      if (text !== null) {
        const choice = chooseAlertButton(text, await alertButtons());
        try {
          if ("label" in choice) await alertClickButton(choice.label);
          else await alertDismiss();
        } catch {
          await alertDismiss().catch(() => {});
        }
        log(`关闭系统弹窗（${"label" in choice ? choice.label : "dismiss"}）`);
        await sleep(500);
        lostStreak = 0;
        return;
      }
      // 已知页面：评论区（关闭✕）或视频流（动作栏）。
      const known = async (): Promise<boolean> => {
        if (await detectCommentCloseButton(size.width, size.height)) return true;
        try {
          await detectRail(size.width, size.height); // 仅作布尔判断
          return true;
        } catch {
          return false;
        }
      };
      const back = async () => {
        await swipe(
          { x: 3, y: size.height * 0.5 },
          { x: size.width * 0.78, y: size.height * 0.5 },
          0.2,
        );
        await sleep(800);
      };

      if (await known()) {
        lostStreak = 0;
        return;
      }
      lostStreak++;
      // 防误伤：只出现一次很可能是横屏/图文帖漏检 → 先观察、不返回。
      if (lostStreak < 2) {
        log("可能离开正常页面（观察中，暂不返回）");
        return;
      }
      // 连续 ≥2 次 → 确实卡住 → 左滑返回脱困（回到已知页即停，最多 3 下）。
      for (let i = 0; i < 3; i++) {
        log("⚠ 连续多次未在正常页面，左滑返回脱困");
        await back();
        if (await known()) {
          lostStreak = 0;
          return;
        }
      }
    },

    async returnToFeed() {
      await ensure();
      // 视频→结果网格→搜索输入→推荐流：连点 3 次左上返回箭头（坐标待 REPL 核实）。
      for (let i = 0; i < 3; i++) {
        await tap({ x: size.width * 0.06, y: size.height * 0.08 });
        await sleep(800);
      }
      page = "feed";
      log("已返回推荐流");
    },

    async returnFromProfile() {
      await ensure();
      // 作品全屏 →(返回箭头)→ 主页网格 →(底部 Home tab)→ 推荐流。
      await tap({ x: size.width * 0.06, y: size.height * 0.08 }); // 返回箭头
      await sleep(800);
      await tap({ x: size.width * 0.1, y: size.height * 0.96 }); // 底部 Home tab
      await sleep(1000);
      page = "feed";
      log("已从个人主页返回推荐流");
    },

    async openOwnProfile() {
      await ensure();
      // 底部导航最右「Profile」tab（390x844 量得 ≈ 屏宽90%、屏高96%；坐标待 REPL 核实）。
      await tap({ x: size.width * 0.9, y: size.height * 0.96 });
      await sleep(1500);
      page = "feed";
      log("已进入个人主页");
    },
    // 主页作品为 3 列网格；真实数未知，返回首屏可见数，由 maxVideoCount 裁剪。
    listOwnVideos: async () => 6,
    async openOwnVideo(index: number) {
      await ensure();
      if (index === 0) {
        // 点作品网格左上第一格 → 进全屏作品流（≈ 屏宽17%、屏高55%；待 REPL 核实）。
        await tap({ x: size.width * 0.17, y: size.height * 0.55 });
        await sleep(1500);
        page = "feed";
      } else {
        await goTo("feed");
        await swipe(
          { x: size.width * 0.5, y: size.height * 0.72 },
          { x: size.width * 0.5, y: size.height * 0.26 },
          0.25,
        );
      }
      log(`打开第 ${index + 1} 条作品`);
    },

    async detectPopup() {
      return false;
    },
  };
}
