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
  detectFollow,
  detectCommentCloseButton,
  detectCommentHearts,
  detectSendButton,
  detectCardClose,
  railBandCenters,
} from "./railDetect";
import { readCaption, recognizeBoxes } from "./ocr";
import { resolveAnchor, type AnchorName } from "../src/engine/anchors";
import { railOffsetY } from "../src/engine/railCheck";
import { isLivePage } from "../src/engine/livePage";
import { detectAppPopup } from "../src/engine/popupDetect";
import { planDismiss } from "../src/engine/popupDismiss";

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
  // 页面锚点：优先标定档覆盖，否则比例默认（与 onDeviceUI 共用 anchors.ts）。
  const A = (name: AnchorName): Point => resolveAnchor(prof ?? {}, size.width, size.height, name);

  // 当前视频右栏坐标：标定坐标按本条视频白带位置吸附（治图标逐视频 ±25px 浮动）；换视频清空。
  let railCache: { like: Point; comment: Point; save: Point; share: Point } | null = null;
  const currentRail = async () => {
    if (railCache) return railCache;
    const p = prof!; // 每个方法调用前都已 ensure()（保证 prof 非空）
    const b = { like: p.like, comment: p.comment, save: p.save, share: p.share };
    let next = b;
    try {
      const ys = (await railBandCenters(size.width, size.height)).map((c) => c.y);
      const dy = railOffsetY([b.like.y, b.comment.y, b.save.y, b.share.y], ys);
      if (dy != null) {
        next = {
          like: { x: b.like.x, y: b.like.y + dy },
          comment: { x: b.comment.x, y: b.comment.y + dy },
          save: { x: b.save.x, y: b.save.y + dy },
          share: { x: b.share.x, y: b.share.y + dy },
        };
      }
    } catch {
      /* 检测失败 → 用原标定坐标 b */
    }
    railCache = next;
    return next;
  };

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
    await tap((await currentRail()).comment);
    await sleep(900); // 等评论面板上滑动画完成
  };
  const rawCloseComments = async () => {
    // 关评论面板：循环从面板顶部往下拖，直到**回到视频流（右栏≥2 白带）**为止。用"回到视频流"作成功标志、
    // 而非"检测不到评论 ✕"——空评论区自动弹键盘时 ✕ 检测不到，会误以为已离开面板而提前退出、其实还卡着。
    // 每次下拖先收键盘、再关面板；纯竖直下滑不误触链接/进商店/地点页。
    for (let i = 0; i < 4; i++) {
      if ((await railBandCenters(size.width, size.height)).length >= 2) return; // 已回视频流
      await swipe(
        { x: size.width * 0.5, y: size.height * 0.35 },
        { x: size.width * 0.5, y: size.height * 0.96 },
        0.25,
      );
      await sleep(500);
    }
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
      railCache = null;
      log("已确保 TikTok 在前台（推荐页）");
    },

    async openFollowingFeed() {
      await ensure();
      await goTo("feed");
      await tap(A("followTab")); // 顶部「关注」tab
      await sleep(1200);
      page = "feed"; // 关注流与推荐流操作一致
      railCache = null;
      log("已切到「关注」视频流");
    },

    async swipeToNextVideo() {
      await ensure();
      await goTo("feed");
      const { width: w, height: h } = size;
      await swipe({ x: w * 0.5, y: h * 0.66 }, { x: w * 0.5, y: h * 0.26 }, 0.25); // 起点上移一点
      railCache = null; // 换视频 → 右栏可能整体上下移，下次动作重测
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
      let isLive = false;
      try {
        isLive = isLivePage(await recognizeBoxes());
      } catch {
        /* OCR 不可用 → 当非直播 */
      }
      log(isLive ? "直播卡，跳过" : caption ? `文案：${caption}` : "未识别到文案");
      return { caption, tags, isLive };
    },

    async likeVideo() {
      await ensure();
      await goTo("feed");
      await tap((await currentRail()).like);
      log("已点赞");
    },

    async saveVideo() {
      await ensure();
      await goTo("feed");
      await tap((await currentRail()).save);
      log("已收藏");
    },

    async followAuthor() {
      await ensure();
      await goTo("feed");
      // 实时检测红 +：在才点（已关注作者无 +，点了会跳进主页）。
      const f = await detectFollow(size.width, size.height, (await currentRail()).like.y);
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
      await tap(A("commentInput"));
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
      await tap(A("searchIcon")); // 放大镜
      await sleep(1000);
      await typeText(keyword);
      await sleep(700);
      await tap(A("searchSubmit")); // 红色 Search 提交
      await sleep(10000); // 等结果加载
      await tap(A("searchSecondResult")); // 打开第二个结果（第一个大概率广告，跳过），进入结果视频流
      await sleep(1500);
      page = "feed"; // 结果视频流与推荐页操作相同，视作 feed
      railCache = null;
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
        railCache = null;
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
      // 应用内浮层（登录/通知/头像/政策等）：OCR 检测 → 视觉 ✕ 或安全脱困计划关掉。
      try {
        const boxes = await recognizeBoxes();
        const hit = detectAppPopup(boxes);
        if (hit) {
          log(`应用内浮层(${hit.id})：${hit.matched}`);
          const cx = await detectCardClose(size.width, size.height);
          if (cx) {
            await tap(cx);
            await sleep(700);
          } else {
            for (const s of planDismiss(hit, boxes, { width: size.width, height: size.height })) {
              // s.kind==="back" 的左滑不再执行（避免把正常页误判后误跳）——浮层靠 ✕/文字/点外部/下滑关。
              if (s.kind === "tap") await tap(s.point);
              else if (s.kind === "swipe") await swipe(s.from, s.to, 0.3);
              else continue;
              await sleep(600);
            }
          }
          lostStreak = 0;
          return;
        }
      } catch {
        /* OCR 不可用 → 跳过浮层处理 */
      }
      // 已知页面：评论区（关闭✕）或视频流（动作栏）。
      const known = async (): Promise<boolean> => {
        if (await detectCommentCloseButton(size.width, size.height)) return true;
        // 视频流：右栏 ≥2 个白色图标带即算「像视频流」——不要求满 4 个（点赞变红/已收藏会少带，
        // 用严格 4 带的 detectRail 会把正常视频页误判为异常）。与坐标吸附同一套 railBandCenters。
        try {
          return (await railBandCenters(size.width, size.height)).length >= 2;
        } catch {
          return false;
        }
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
      // 连续 ≥2 次 → **不再自动左滑脱困**（known() 有时把正常页误判为异常，盲目左滑反而误跳别的页）。
      // 只记日志（REPL 无管理中心；产品端 onDeviceUI 会 onEvent 通知管理中心）。不做任何触控、不改 page。
      if (lostStreak === 2) {
        log("⚠ 疑似卡在未知页面（连续多次未在正常页面）；不自动左滑，等待人工处理");
      }
    },

    async returnToFeed() {
      await ensure();
      // 视频→结果网格→搜索输入→推荐流：连点 3 次左上返回箭头。
      for (let i = 0; i < 3; i++) {
        await tap(A("backArrow"));
        await sleep(800);
      }
      page = "feed";
      log("已返回推荐流");
    },

    async returnFromProfile() {
      await ensure();
      // 作品全屏 →(返回箭头)→ 主页网格 →(底部 Home tab)→ 推荐流。
      await tap(A("backArrow")); // 返回箭头
      await sleep(800);
      await tap(A("homeTab")); // 底部 Home tab
      await sleep(1000);
      page = "feed";
      log("已从个人主页返回推荐流");
    },

    async openOwnProfile() {
      await ensure();
      await tap(A("profileTab")); // 底部导航最右「我」tab
      await sleep(1500);
      page = "feed";
      log("已进入个人主页");
    },
    // 主页作品为 3 列网格；真实数未知，返回首屏可见数，由 maxVideoCount 裁剪。
    listOwnVideos: async () => 6,
    async openOwnVideo(index: number) {
      await ensure();
      railCache = null; // 进/切作品 → 新视频，右栏重测
      if (index === 0) {
        await tap(A("gridFirstCell")); // 作品网格左上第一格 → 全屏作品流
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
      try {
        return !!detectAppPopup(await recognizeBoxes());
      } catch {
        return false;
      }
    },

    /**
     * 发布（REPL 调试用）：走 TikTok「+ → 上传 → 选相册第一条 → 下一步 → 文案 → 发布」。
     * ⚠️ 上传流程锚点 publish* 为占位比例，需真机 calibrate 覆盖后才可靠。
     */
    async publishVideo(_assetUri: string, caption: string) {
      await ensure();
      await tap(A("publishCreate"));
      await sleep(1500);
      await tap(A("publishUpload"));
      await sleep(1200);
      await tap(A("publishAlbumFirst"));
      await sleep(1000);
      await tap(A("publishNext"));
      await sleep(2500);
      await tap(A("publishNext"));
      await sleep(1500);
      if (caption) {
        await tap(A("publishCaption"));
        await sleep(600);
        await typeText(caption);
        await sleep(500);
      }
      await tap(A("publishPost"));
      await sleep(2000);
      log("已尝试发布（⚠ 上传流程坐标需真机标定核实）");
    },
  };
}
