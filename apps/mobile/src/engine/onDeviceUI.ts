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
  detectCardClose,
  detectCommentCloseButton,
  detectCommentHearts,
  detectFollow,
  detectRail,
  detectSendButton,
  railBandCenters,
} from "../vision/detect";
import { railOffsetY } from "./railCheck";
import { isLivePage } from "./livePage";
import { captionFromBoxes, type OcrBox } from "../vision/caption";
import { detectAppPopup } from "./popupDetect";
import { planDismiss } from "./popupDismiss";
import { resolveAnchor, type AnchorName } from "./anchors";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 设备标定坐标（与 tools/devices.json 同形）。 */
export interface DeviceProfile {
  screen: { w: number; h: number };
  like: Point;
  comment: Point;
  save: Point;
  share: Point;
  follow?: Point | null;
  /** 各页面导航/输入/发布锚点的按机型覆盖（缺省用 anchors.ts 的比例默认）。 */
  anchors?: Partial<Record<AnchorName, Point>>;
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
  // 解析某页面锚点：优先标定档覆盖值，否则用比例默认（anchors.ts 单一真源）。
  const A = (name: AnchorName): Point => resolveAnchor(prof, size.width, size.height, name);
  let sized = false; // 屏幕尺寸只查一次（竖屏锁定，运行期不变），避免每个动作都往返 WDA
  let page: Page = "feed";
  let heartCache: Point[] = [];
  // 当前视频的右栏坐标（标定坐标按本条视频白带位置吸附后的结果）；换视频时清空、下次动作重测。
  let railCache: { like: Point; comment: Point; save: Point; share: Point } | null = null;
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

  /**
   * 当前视频的右栏坐标：标定存的是某个视频的绝对 y，而图标逐视频上下浮动 ±~25px。
   * 每条视频进来第一次用到右栏时，测一次当前白带位置、把标定坐标整体平移吸附上去（缓存到换视频）。
   * 检测不可靠（白带对不上/异常屏）时回退用原标定坐标，绝不比改前更差。
   */
  const base = { like: prof.like, comment: prof.comment, save: prof.save, share: prof.share };
  const currentRail = async (): Promise<typeof base> => {
    if (railCache) return railCache;
    let next = base;
    try {
      const ys = railBandCenters(await shot(), size.width, size.height).map((c) => c.y);
      const dy = railOffsetY([base.like.y, base.comment.y, base.save.y, base.share.y], ys);
      if (dy != null) {
        next = {
          like: { x: base.like.x, y: base.like.y + dy },
          comment: { x: base.comment.x, y: base.comment.y + dy },
          save: { x: base.save.x, y: base.save.y + dy },
          share: { x: base.share.x, y: base.share.y + dy },
        };
      }
    } catch {
      /* 检测失败/异常屏 → 用原标定坐标 base，绝不比改前更差 */
    }
    railCache = next;
    return next;
  };

  // 进主页等场景概率弹出的「Sign In / 管理 passkey」系统弹窗：OCR 命中关键词就关掉。
  const POPUP_RE = /sign\s*in|passkey|autofill|another device|manage your/i;
  const dismissPopup = async (): Promise<void> => {
    for (let i = 0; i < 3; i++) {
      const boxes = await ocr(await screenshot());
      const text = boxes.map((b) => b.text).join(" ");
      if (!POPUP_RE.test(text)) return;
      if (i === 0) {
        await tap(A("popupClose")); // 弹窗右上 ✕
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
      // 优先视觉定位卡片右上 ✕（比固定坐标可靠）；关掉了就跳过通用计划，避免已关闭后误点信息流。
      let closedByIcon = false;
      try {
        const cx = detectCardClose(decode(await screenshot()), size.width, size.height);
        if (cx) {
          await tap(cx);
          await sleep(700);
          closedByIcon = !detectAppPopup(await ocr(await screenshot()));
        }
      } catch {
        /* 视觉定位失败 → 走通用脱困计划 */
      }
      if (!closedByIcon) {
        for (const s of planDismiss(hit, boxes, size)) {
          if (s.kind === "tap") await tap(s.point);
          else if (s.kind === "swipe") await swipe(s.from, s.to, 0.3);
          else await doSwipeBack();
          await sleep(600);
        }
      }
    }
    const still = !!detectAppPopup(await ocr(await screenshot()));
    onEvent?.("popup_escaped", { ok: !still });
    if (still) log("⚠ 应用内浮层多次未能自动关闭");
    return still ? "stuck" : "escaped";
  };

  // iOS 系统权限弹窗：用 WDA alert 接口读按钮、按意图表点（发布需要的相机/麦克风/相册 → 允许，其余拒绝）。
  // 关掉了返回 true。比 OCR 可靠（系统 alert 走 springboard）。
  // **循环清栈**：相机+麦克风等会连续弹两三个，一次调用把当前堆叠的都清掉（最多 4 个防死循环）。
  const handleSystemAlert = async (): Promise<boolean> => {
    let any = false;
    for (let i = 0; i < 4; i++) {
      const text = await alertText();
      if (text === null) break;
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
      any = true;
      await sleep(500);
    }
    return any;
  };

  // 轮询清系统权限弹窗最多 maxSeconds 秒：出现就清（含堆叠），连续两次没有就提前返回。
  // 兼顾「首次弹权限」与「后续已授权不弹」——有没有弹窗都不卡流程，也不漏迟到几百 ms 才弹的窗。
  const settleAlerts = async (maxSeconds: number): Promise<void> => {
    let idle = 0;
    for (let i = 0; i < maxSeconds * 2; i++) {
      if (await handleSystemAlert()) {
        idle = 0;
        continue;
      }
      if (++idle >= 2) return;
      await sleep(500);
    }
  };

  // 复位到推荐流基地的核心动作：确保 TikTok 前台 → 关系统权限弹窗 → 关残留评论区 → 关登录/passkey 浮层。
  // recoverToFeed（引擎每批开头）与 publishVideo（发布前）共用，避免重复。
  const backToFeedBase = async (): Promise<void> => {
    await ensure();
    await handleSystemAlert();
    for (let i = 0; i < 3; i++) {
      const x = detectCommentCloseButton(await shot(), size.width, size.height);
      if (!x) break;
      await tap(x);
      await sleep(450);
    }
    await dismissPopup();
    page = "feed";
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
    await tap((await currentRail()).comment);
    await sleep(900);
  };
  const rawCloseComments = async () => {
    // 空评论区会自动聚焦输入框、弹键盘挡住关闭。先点面板标题区（在输入框与列表之上，安全）收起键盘，
    // 再走关闭流程——否则 ✕ 会被键盘干扰，得手动先关键盘再关面板。
    await tap({ x: size.width * 0.5, y: size.height * 0.3 });
    await sleep(350);
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
      railCache = null;
      log("已确保 TikTok 在前台（推荐页）");
    },

    async openFollowingFeed() {
      await ensure();
      await goTo("feed"); // 先确保在主 feed（顶部才有「关注 / 推荐」切换）
      await tap(A("followTab")); // 顶部「关注」tab
      await sleep(1200);
      await dismissPopup(); // 切流概率弹登录/passkey 窗
      page = "feed"; // 关注流与推荐流操作一致，视作 feed
      railCache = null;
      log("已切到「关注」视频流");
    },

    async swipeToNextVideo() {
      await ensure();
      await goTo("feed");
      const { width: w, height: h } = size;
      await swipe({ x: w * 0.5, y: h * 0.72 }, { x: w * 0.5, y: h * 0.26 }, 0.25);
      railCache = null; // 换视频 → 右栏可能整体上下移，下次动作重测
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
      const live = isLivePage(boxes);
      log(live ? "直播卡，跳过" : caption ? `文案：${caption}` : "未识别到文案");
      return { caption, tags, isLive: live };
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
      const f = detectFollow(await shot(), size.width, size.height, (await currentRail()).like.y);
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
        // "Reply" 在该评论行下方、左侧：x 用锚点，y 随该评论行。
        await tap({ x: A("replyEntry").x, y: pc.y * size.height + size.height * 0.02 });
      } else {
        await tap(A("commentInput"));
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
      await tap(A("searchIcon"));
      await sleep(1000);
      await typeText(keyword);
      await sleep(700);
      await tap(A("searchSubmit"));
      await sleep(10000);
      await tap(A("searchFirstResult"));
      await sleep(1500);
      page = "feed";
      railCache = null;
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
        railCache = null;
        log(`上滑到第 ${index + 1} 个结果`);
      }
    },
    back: async () => {},

    async openOwnProfile() {
      await ensure();
      await tap(A("profileTab")); // 底部导航最右「我」tab
      await sleep(1500);
      await dismissPopup(); // 进主页概率弹「登录/passkey」窗，关掉
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
      // 视频→结果网格→搜索输入→推荐流：连点 3 次左上返回箭头。
      for (let i = 0; i < 3; i++) {
        await tap(A("backArrow"));
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
        await tap(A("popupClose"));
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
      await tap(A("backArrow")); // 返回箭头
      await sleep(800);
      await tap(A("homeTab")); // 底部 Home tab
      await sleep(1000);
      page = "feed";
      log("已从个人主页返回推荐流");
    },

    async recoverToFeed(): Promise<boolean> {
      await backToFeedBase(); // 关系统弹窗 + 残留评论区 + 登录/passkey 浮层 → 回基地
      log("已回到推荐流（基地）");
      return true;
    },

    /**
     * 发布：视频已由上层 downloadToAlbum 存入相册（相册最新一条）。走 TikTok「+ → 上传 →
     * 选相册第一条 → 下一步 → 文案 → 发布」。⚠️ 上传流程锚点 publish* 均为占位比例，
     * 必须真机 calibrate 覆盖后才可靠——否则会点偏（见 anchors.ts publish* 与收尾清单）。
     */
    async publishVideo(_assetUri: string, caption: string) {
      // ⚠️ 关键：发布必须从「能看到底部导航 [+]」的干净基地开始。下发时引擎可能停在**任意页**——
      // 评论区/搜索结果/作品详情/个人主页/关注流……直接点 [+] 会点偏。先复位：
      //   1) 关系统权限弹窗 + 应用内浮层；2) 关残留评论区；3) 退出「搜索结果/作品详情」等看不到底部
      //   导航的 pushed 页（不在已知页就左滑返回，最多 4 次）。这样无论从哪儿发起，都先回到基地。
      log("发布⓪：复位到基地（关评论/浮层、退出内层页）");
      await backToFeedBase(); // 与 recoverToFeed 共用：关系统弹窗 + 评论区 + 登录/passkey 浮层
      // backToFeedBase 不退 pushed 页；发布必须能看到底部 [+]，故补一步：不在已知页(视频流/评论)就左滑返回，最多 4 次。
      for (let i = 0; i < 4; i++) {
        if (onKnownPage(decode(await screenshot()))) break; // 回到视频流/评论区即停（避免在基地乱滑）
        await doSwipeBack();
        await sleep(400);
      }
      await settleAlerts(2);
      // 以下每步打日志（卡在哪一步一眼看出→调对应 publish 锚点）；权限用 settleAlerts 轮询清，有没有弹窗都不卡。
      log("发布①：打开创作页（+）");
      await tap(A("publishCreate"));
      await sleep(1500);
      await settleAlerts(3); // 相机/麦克风权限（点「好」）
      log("发布②：进相册上传（左下相册图标）");
      await tap(A("publishUpload"));
      await sleep(1200);
      await settleAlerts(3); // 相册权限（点「允许访问所有照片」）
      log("发布③：选相册最新一条（= 刚下载的视频）");
      await tap(A("publishAlbumFirst"));
      await sleep(1200);
      await settleAlerts(2);
      log("发布④：下一步（预览页）");
      await tap(A("publishNext"));
      await sleep(2500);
      log("发布⑤：下一步（编辑页）");
      await tap(A("publishNext"));
      await sleep(1500);
      if (caption) {
        log("发布⑥：填写描述");
        await tap(A("publishCaption"));
        await sleep(600);
        await typeText(caption);
        await sleep(500);
      }
      log("发布⑦：点「发布」");
      await tap(A("publishPost"));
      await sleep(2500);
      await settleAlerts(3); // 发布后常弹「同步 Facebook 好友」等 → 拒绝（取消）
      log("发布⑧：已提交（若某步点偏，看日志停在哪步 → 调对应 publish 锚点）");
    },
  };
}
