import {
  activateApp,
  alertButtons,
  alertClickButton,
  alertDismiss,
  alertText,
  applyFastSettings,
  createSession,
  getSessionId,
  screenshot,
  swipe,
  tap,
  typeText,
  windowSize,
  TIKTOK_BUNDLE_ID,
  type Point,
} from "../wda";
import { chooseAlertButton } from "./alertIntent";
import { parseComments, type ParsedComment } from "./commentParse";
import type { TikTokUI, VideoInfo, CommentInfo } from "./tiktok-ui";
import {
  decode,
  detectCommentCloseButton,
  detectCommentHearts,
  detectFollow,
  detectRail,
  detectSendButton,
} from "../vision/detect";
import { captionFromBoxes, type OcrBox } from "../vision/caption";
import { detectAppPopup } from "./popupDetect";
import { planDismiss } from "./popupDismiss";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 设备标定坐标（与 tools/devices.json 同形）。 */
export interface DeviceProfile {
  screen: { w: number; h: number };
  like: Point;
  comment: Point;
  save: Point;
  share: Point;
  follow?: Point | null;
}

/** 注入的 OCR：整屏 base64 PNG → 文字框列表（手机端接 Apple Vision 模块）。 */
export type OcrFn = (base64Png: string) => Promise<OcrBox[]>;

type Page = "feed" | "comments";

/**
 * 手机端 TikTokUI：截图(fetch WDA) → src/vision 纯 JS 检测 + 注入 OCR → 标定坐标点击。
 * 与电脑版 calibratedUI 逻辑一致（含页面状态机），但全部用 RN 安全的依赖。
 * OCR 与标定坐标由调用方注入，保持本文件不耦合原生模块。
 */
export function createOnDeviceUI(deps: {
  profile: DeviceProfile;
  ocr: OcrFn;
  log: (msg: string) => void;
  /** 可选埋点回调（app 层注入 telemetry.track；引擎层不直接依赖 RN）。 */
  onEvent?: (name: string, props?: Record<string, unknown>) => void;
}): TikTokUI {
  const { profile: prof, ocr, log, onEvent } = deps;
  let size = { width: prof.screen.w, height: prof.screen.h };
  let sized = false; // 屏幕尺寸只查一次（竖屏锁定，运行期不变），避免每个动作都往返 WDA
  let page: Page = "feed";
  let heartCache: Point[] = [];
  // listComments 时 OCR 解析出的评论（文字+作者+y），供 #3 匹配与针对性回复。
  let commentCache: ParsedComment[] = [];
  // 连续"不在正常页面"的次数；用于避免横屏/图文帖偶发漏检导致在正常视频上误返回。
  let lostStreak = 0;

  const ensure = async () => {
    if (!getSessionId()) {
      await createSession();
      await applyFastSettings();
    }
    await activateApp(TIKTOK_BUNDLE_ID);
    if (!sized) {
      try {
        size = await windowSize();
        sized = true;
      } catch {
        /* 用 profile 尺寸兜底，下次再试 */
      }
    }
  };

  /** 抓一张屏并解码成像素。 */
  const shot = async () => decode(await screenshot());

  // 进主页等场景概率弹出的「Sign In / 管理 passkey」系统弹窗：OCR 命中关键词就关掉。
  const POPUP_RE = /sign\s*in|passkey|autofill|another device|manage your/i;
  const dismissPopup = async (): Promise<void> => {
    for (let i = 0; i < 3; i++) {
      const boxes = await ocr(await screenshot());
      const text = boxes.map((b) => b.text).join(" ");
      if (!POPUP_RE.test(text)) return;
      if (i === 0) {
        // 先点弹窗右上 ✕（坐标待 REPL 核实）。
        await tap({ x: size.width * 0.92, y: size.height * 0.6 });
      } else {
        // 仍在 → 下滑关掉底部 sheet 兜底。
        await swipe(
          { x: size.width * 0.5, y: size.height * 0.62 },
          { x: size.width * 0.5, y: size.height * 0.97 },
          0.3,
        );
      }
      await sleep(700);
      log("关闭登录/passkey 弹窗");
    }
  };

  // 应用内浮层（TikTok 自有弹窗/底部单，/alert 看不到）：检测→按计划脱困→重检，最多 3 轮。
  const escapeAppPopup = async (): Promise<"none" | "escaped" | "stuck"> => {
    let detected = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const boxes = await ocr(await screenshot());
      const hit = detectAppPopup(boxes);
      if (!hit) {
        if (detected) onEvent?.("popup_escaped", { ok: true });
        return detected ? "escaped" : "none";
      }
      detected = true;
      log(`应用内浮层(${hit.id})：${hit.matched}`);
      onEvent?.("popup_detected", { id: hit.id });
      for (const s of planDismiss(hit, boxes, size)) {
        if (s.kind === "tap") await tap(s.point);
        else if (s.kind === "swipe") await swipe(s.from, s.to, 0.3);
        else await doSwipeBack();
        await sleep(600);
      }
    }
    const still = !!detectAppPopup(await ocr(await screenshot()));
    onEvent?.("popup_escaped", { ok: !still });
    if (still) log("⚠ 应用内浮层多次未能自动关闭");
    return still ? "stuck" : "escaped";
  };

  // iOS 系统权限弹窗：用 WDA alert 接口读按钮、按意图表点（除相册外一律拒绝）。
  // 关掉了返回 true。比 OCR 可靠（系统 alert 走 springboard）。
  const handleSystemAlert = async (): Promise<boolean> => {
    const text = await alertText();
    if (text === null) return false;
    const buttons = await alertButtons();
    const choice = chooseAlertButton(text, buttons);
    try {
      if ("label" in choice) {
        await alertClickButton(choice.label);
        log(`关闭系统弹窗 → 点「${choice.label}」`);
      } else {
        await alertDismiss();
        log("关闭系统弹窗 → dismiss");
      }
    } catch {
      await alertDismiss().catch(() => {});
    }
    await sleep(500);
    return true;
  };

  // 从左边缘往右滑（iOS 返回手势），退出误入的页面。
  const doSwipeBack = async () => {
    await swipe(
      { x: 3, y: size.height * 0.5 },
      { x: size.width * 0.78, y: size.height * 0.5 },
      0.2,
    );
    await sleep(800);
  };

  // 当前是否在"已知/正常"页面：视频流（有动作栏）或评论区（有关闭✕）。
  const onKnownPage = (img: ReturnType<typeof decode>): boolean => {
    if (detectCommentCloseButton(img, size.width, size.height)) return true;
    try {
      detectRail(img, size.width, size.height); // 仅作布尔判断（有没有动作栏）
      return true;
    } catch {
      return false;
    }
  };

  const rawOpenComments = async () => {
    await tap(prof.comment);
    await sleep(900);
  };
  const rawCloseComments = async () => {
    for (let i = 0; i < 3; i++) {
      const x = detectCommentCloseButton(await shot(), size.width, size.height);
      if (!x) return;
      await tap(x);
      await sleep(400);
    }
    await swipe(
      { x: size.width * 0.5, y: size.height * 0.3 },
      { x: size.width * 0.5, y: size.height * 0.95 },
      0.3,
    );
  };

  const goTo = async (target: Page) => {
    if (page === target) return;
    if (target === "feed") {
      await rawCloseComments();
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
    getPage: () => page,

    async openForYou() {
      await ensure();
      page = "feed";
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
      const boxes = await ocr(await screenshot());
      const caption = captionFromBoxes(boxes);
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
      await tap(prof.like);
      log("已点赞");
    },

    async saveVideo() {
      await ensure();
      await goTo("feed");
      await tap(prof.save);
      log("已收藏");
    },

    async followAuthor() {
      await ensure();
      await goTo("feed");
      const f = detectFollow(await shot(), size.width, size.height, prof.like.y);
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
      const png = await screenshot();
      heartCache = detectCommentHearts(decode(png), size.width, size.height); // 点赞位置（已验证）
      commentCache = parseComments(await ocr(png)); // 评论文字+作者（#3，阈值待真机调）
      log(
        `评论解析：${commentCache.length} 条` +
          (commentCache[0] ? `（例：${commentCache[0].author} - ${commentCache[0].text.slice(0, 24)}）` : ""),
      );
      // 近似对齐：第 i 个爱心 ↔ 第 i 条解析评论（都按从上到下）。
      const n = Math.max(heartCache.length, commentCache.length);
      return Array.from({ length: n }, (_, i) => ({
        index: i,
        text: commentCache[i]?.text ?? "",
        author: commentCache[i]?.author,
      }));
    },

    async likeComment(c: CommentInfo) {
      const p = heartCache[c.index];
      if (!p) return;
      await tap(p);
      log(`已赞评论 ${c.index + 1}`);
    },

    async replyComment(c: CommentInfo, text: string) {
      await ensure();
      await goTo("comments");
      // #3：有该评论的解析位置 → 点它的"Reply"入口（@该作者）；否则回退底部输入框（顶层评论）。
      const pc = commentCache[c.index];
      if (pc) {
        // "Reply" 在该评论行下方、左侧（≈ 屏宽 25%）。坐标待 REPL 调。
        await tap({ x: size.width * 0.25, y: pc.y * size.height + size.height * 0.02 });
      } else {
        await tap({ x: size.width * 0.28, y: size.height * 0.944 });
      }
      await sleep(800);
      await typeText(text);
      await sleep(600);
      const send = detectSendButton(decode(await screenshot()), size.width, size.height);
      if (!send) return log("未检测到发送按钮，跳过回复");
      await tap(send);
      log(`已发评论${c.author ? " @" + c.author : ""}：${text}`);
    },

    async search(keyword: string) {
      await ensure();
      await goTo("feed");
      const { width: W, height: H } = size;
      await tap({ x: W - 28, y: 69 });
      await sleep(1000);
      await typeText(keyword);
      await sleep(700);
      await tap({ x: W - 43, y: 69 });
      await sleep(10000);
      await tap({ x: W * 0.25, y: H * 0.255 });
      await sleep(1500);
      page = "feed";
      log(`已搜索「${keyword}」并进入结果视频流`);
    },
    // 真机无法可靠数搜索结果数；返回大值，让调用方的 maxResults 决定遍历多少条。
    countSearchResults: async () => 999,
    async openSearchResult(index: number) {
      await ensure();
      await goTo("feed");
      if (index > 0) {
        await swipe(
          { x: size.width * 0.5, y: size.height * 0.72 },
          { x: size.width * 0.5, y: size.height * 0.26 },
          0.25,
        );
        log(`上滑到第 ${index + 1} 个结果`);
      }
    },
    back: async () => {},

    async openOwnProfile() {
      await ensure();
      // 底部导航最右「Profile」tab（390x844 量得 ≈ 屏宽90%、屏高96%；坐标待 REPL 核实）。
      await tap({ x: size.width * 0.9, y: size.height * 0.96 });
      await sleep(1500);
      await dismissPopup(); // 进主页概率弹「登录/passkey」窗，关掉
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
        // 后续上滑切下一条作品（同搜索结果流）。
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
      return !!detectAppPopup(await ocr(await screenshot()));
    },

    /**
     * 回到"基地"（推荐流干净状态）。保守可靠版:
     *  1. 确保 TikTok 在前台（被切走/崩溃会重新拉起）;
     *  2. 关掉残留的评论区/面板（最常见卡点,尤其空评论区会自动弹键盘）;
     *  3. 复位页面状态机。
     * 返回 true（尽力而为）。
     * TODO(需真机确认逃离方式后再加):
     *   - 个人主页是 pushed 页面、无底部导航，需用左上返回键/边缘返回手势逃离;
     *   - 搜索结果流回真推荐流的方式也待确认;
     *   - 登录/广告/风控弹窗的图像+OCR 识别与关闭。
     */
    async returnToFeed(): Promise<void> {
      await ensure();
      // 视频→结果网格→搜索输入→推荐流：连点 3 次左上返回箭头（坐标待 REPL 核实）。
      for (let i = 0; i < 3; i++) {
        await tap({ x: size.width * 0.06, y: size.height * 0.08 });
        await sleep(800);
      }
      page = "feed";
      log("已返回推荐流");
    },

    async swipeBack(): Promise<void> {
      await doSwipeBack();
    },

    async recoverIfLost(): Promise<void> {
      // 先处理 iOS 系统权限弹窗（新号高发）——关掉后多半就回正常页了。
      if (await handleSystemAlert()) {
        lostStreak = 0;
        return;
      }
      // 再处理应用内浮层（TikTok 自有弹窗/底部单）——能自动关就关掉继续。
      if ((await escapeAppPopup()) !== "none") {
        lostStreak = 0;
        return;
      }
      const png = await screenshot();
      const img = decode(png);
      if (onKnownPage(img)) {
        lostStreak = 0; // 视频流 / 评论区 → 正常
        return;
      }
      // 非视频流/评论区：先看是不是已知弹窗（登录/passkey）→ 关掉，算已处理。
      const text = (await ocr(png)).map((b) => b.text).join(" ");
      if (POPUP_RE.test(text)) {
        await tap({ x: size.width * 0.92, y: size.height * 0.6 });
        await sleep(700);
        log("关闭登录/passkey 弹窗");
        lostStreak = 0;
        return;
      }
      lostStreak++;
      // 防误伤：只出现一次很可能是横屏/图文帖导致动作栏漏检 → 先观察、不返回。
      if (lostStreak < 2) {
        log("可能离开正常页面（观察中，暂不返回）");
        return;
      }
      // 连续 ≥2 次都不在正常页面 → 确实卡住 → 左滑返回脱困（回到已知页即停，最多 3 下）。
      for (let i = 0; i < 3; i++) {
        log("⚠ 连续多次未在正常页面，左滑返回脱困");
        await doSwipeBack();
        if (onKnownPage(decode(await screenshot()))) {
          lostStreak = 0;
          return;
        }
      }
    },

    async returnFromProfile(): Promise<void> {
      await ensure();
      // 作品全屏 →(返回箭头)→ 主页网格 →(底部 Home tab)→ 推荐流。
      await tap({ x: size.width * 0.06, y: size.height * 0.08 }); // 返回箭头
      await sleep(800);
      await tap({ x: size.width * 0.1, y: size.height * 0.96 }); // 底部 Home tab
      await sleep(1000);
      page = "feed";
      log("已从个人主页返回推荐流");
    },

    async recoverToFeed(): Promise<boolean> {
      await ensure();
      await handleSystemAlert(); // 先关 iOS 系统权限弹窗
      // 关掉残留的评论区/面板（最常见卡点）。
      for (let i = 0; i < 3; i++) {
        const x = detectCommentCloseButton(await shot(), size.width, size.height);
        if (!x) break;
        await tap(x);
        await sleep(450);
      }
      await dismissPopup(); // 关掉可能出现的登录/passkey 弹窗
      page = "feed";
      log("已回到推荐流（基地）");
      return true;
    },
  };
}
