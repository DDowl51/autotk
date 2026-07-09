import {
  activateApp,
  alertButtons,
  alertClickButton,
  alertDismiss,
  alertText,
  applyFastSettings,
  createSession,
  resetSession,
  getSessionId,
  screenshot,
  swipe as wdaSwipe,
  tap as wdaTap,
  typeText as wdaTypeText,
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
  detectCommentHearts,
  detectCommentPanel,
  detectFollow,
  detectModalCard,
  detectSendButton,
  railBandCenters,
} from "../vision/detect";
import { railOffsetY } from "./railCheck";
import { isLivePage } from "./livePage";
import { captionFromBoxes, type OcrBox } from "../vision/caption";
import { looksSameCaption, isCaptionComparable } from "./captionSimilarity";
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
  /** 停止请求信号：为 true 时 ensure() 不再把 TikTok 切前台（停止后不再抢用户的 autotk 前台）。 */
  isStopping?: () => boolean;
}): TikTokUI {
  const { profile: prof, ocr, log, onEvent, isStopping } = deps;
  // 停止请求后，所有**触控**动作整体变 no-op：ensure() 那时已不再把 TikTok 切前台，
  // 若继续 tap/type，会落在前台的 autotk 自己身上（最坏把评论话术敲进配置输入框）。
  // 读操作（截图/检测/OCR）无副作用，不拦。发布流程另有守卫（停止时抛错而非静默空走）。
  const tap = async (p: Point) => {
    if (isStopping?.()) return;
    await wdaTap(p);
  };
  const swipe = async (from: Point, to: Point, duration?: number) => {
    if (isStopping?.()) return;
    await wdaSwipe(from, to, duration);
  };
  const typeText = async (text: string) => {
    if (isStopping?.()) return;
    await wdaTypeText(text);
  };
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
  // 上一条视频的文案（由 readCurrentVideo 记录）；swipeToNextVideo 用它判断「上划后是否仍是同一条」。
  let lastCaption = "";
  // 「需人工处理」告警（脱困卡住等）→ 由 getAlert() 上报到管理中心 DeviceStatus.alert（设备列表醒目红点）；
  // 一旦 recoverIfLost 判回到已知页/成功处理（lostStreak=0）就自动清空。
  let stuckAlert: string | null = null;

  const ensure = async () => {
    if (!getSessionId()) {
      await createSession();
      await applyFastSettings();
    }
    // 停止请求后不再把 TikTok 切前台——否则用户切回 autotk 想停，引擎的下一个动作又把 TikTok 顶上来。
    if (isStopping?.()) return;
    try {
      await activateApp(TIKTOK_BUNDLE_ID);
    } catch (e) {
      // WDA 进程可能已重启 → 旧 session 在设备侧失效（404 invalid session），但本地 sessionId 仍非空，
      // 上面的 getSessionId() 判空就不会重建 → 后续请求全 404 → 整夜熔断死循环、无法自愈。
      // 这里清掉本地 session 重建一次再试；若 WDA 真宕机则 createSession 也抛错，退化成原来的批次退避。
      log(`WDA 会话失效，重建后重试：${e instanceof Error ? e.message : String(e)}`);
      resetSession();
      await createSession();
      await applyFastSettings();
      if (isStopping?.()) return;
      await activateApp(TIKTOK_BUNDLE_ID);
    }
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
    // 停止后触控全是 no-op，脱困尝试注定失败——直接返回，别空转 3 轮截图+OCR（约 20-30s）。
    if (isStopping?.()) return "none";
    let detected = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const png = await screenshot();
      const boxes = await ocr(png);
      const hit = detectAppPopup(boxes);
      if (!hit) {
        // OCR 无签名命中 → 再用「通用模态卡」纯视觉兜底：TikTok 层出不穷的推广浮层未必有已知词，
        // 但结构一致（顶部变暗 + 白卡 + 卡片右上黑 ✕）。只在**非评论页**试——评论面板同为白卡+右上✕，
        // 不能被当浮层关掉。找到 ✕ 就点、回到循环顶重检。
        if (page !== "comments") {
          const mc = detectModalCard(decode(png), size.width, size.height);
          if (mc) {
            detected = true;
            log("应用内浮层(模态卡·视觉)：点卡片右上 ✕");
            onEvent?.("popup_detected", { id: "modal-card" });
            await tap(mc);
            await sleep(700);
            continue;
          }
        }
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
          // s.kind==="back" 的左滑不再执行（避免把正常页误判后误跳）——浮层靠点 ✕/文字按钮/点外部/下滑关。
          if (s.kind === "tap") await tap(s.point);
          else if (s.kind === "swipe") await swipe(s.from, s.to, 0.3);
          else continue;
          await sleep(600);
        }
      }
    }
    const finalPng = await screenshot();
    const still =
      !!detectAppPopup(await ocr(finalPng)) ||
      (page !== "comments" && !!detectModalCard(decode(finalPng), size.width, size.height));
    onEvent?.("popup_escaped", { ok: !still });
    if (still) log("⚠ 应用内浮层多次未能自动关闭");
    return still ? "stuck" : "escaped";
  };

  // iOS 系统权限弹窗：用 WDA alert 接口读按钮、按意图表点（发布需要的相机/麦克风/相册 → 允许，其余拒绝）。
  // 关掉了返回 true。比 OCR 可靠（系统 alert 走 springboard）。
  // **循环清栈**：相机+麦克风等会连续弹两三个，一次调用把当前堆叠的都清掉（最多 4 个防死循环）。
  const handleSystemAlert = async (): Promise<boolean> => {
    // 停止后不再碰系统弹窗（WDA /alert 不分 app——用户此刻可能正看着 autotk 自己的权限对话框）。
    if (isStopping?.()) return false;
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
      if (isStopping?.()) return; // 停止后立即退出轮询（handleSystemAlert 也已不再点弹窗）
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
    // 关残留评论区并确认回到已知页；旧版这里直接连点 detectCommentCloseButton 3 次、无「误进地点页则脱困」
    // 兜底（比 rawCloseComments 还危险，且被发布前复位复用），统一改走安全闭环。
    await closeCommentPanelSafely();
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

  // 当前是否在"已知/正常"页面：视频流（有动作栏）或评论/底部面板（含空评论弹键盘态）。
  const onKnownPage = (img: ReturnType<typeof decode>): boolean => {
    // 评论/底部面板：找到白色面板顶横边即算——**不要求找到 ✕**（空评论区自动弹键盘时 ✕ 检测不到，
    // 但面板顶横边仍在；旧版用「有 ✕」判会把这态误判为「不在正常界面」）。
    if (detectCommentPanel(img, size.width, size.height)) return true;
    // 视频流：右栏 **≥2 个白色图标带** 即算「像视频流」——不要求满 4 个。
    // 旧版用 detectRail（严格 4 带）判定：点赞变红/已收藏/一点噪声少一带，正常视频页就被误判为异常
    // → 误告警率高。改用 railBandCenters（本就容忍带数≠4，与运行时坐标吸附同一套）+ 放宽到 ≥2。
    try {
      return railBandCenters(img, size.width, size.height).length >= 2;
    } catch {
      return false;
    }
  };

  // 关评论面板并**确认真回到已知页**：每轮找到关闭 ✕ 就点；找不到 ✕ 时——在已知页(视频流/评论)才算
  // 关成功返回，否则说明关的过程中被误点进了 pushed 页（最典型：评论顶端地点横幅 → 地点页），立即左滑
  // 返回脱困。最多 3 轮，仍未回则从面板中部下滑 dismiss 兜底 + 最后再校验一次。
  // 这补上了旧版的致命缺口：旧版「detectCommentCloseButton 返回 null 就当已回 feed」——但地点页同样没有
  // 白 ✕，两者被混为一谈，于是误进地点页却把 page 置成 'feed'，状态机自信卡死。
  const closeCommentPanelSafely = async (): Promise<void> => {
    // 关评论面板：**循环从面板顶部往下拖，直到回到视频流（右栏≥2 白带）为止**。
    // 用"回到视频流"作成功标志、而非"检测不到评论 ✕"——空评论区会自动聚焦输入框弹键盘，此时 ✕ 检测不到，
    // 用"没✕"会误以为已离开面板而提前退出、其实还卡在评论区。每次下拖：先收键盘、再关面板（拖到底）。
    // 纯竖直下滑，不会误触链接/进商店/地点页。
    for (let i = 0; i < 4; i++) {
      const img = await shot();
      if (railBandCenters(img, size.width, size.height).length >= 2) return; // 已回视频流
      await swipe(
        { x: size.width * 0.5, y: size.height * 0.35 },
        { x: size.width * 0.5, y: size.height * 0.96 },
        0.25,
      );
      await sleep(500);
    }
    // 拖了几次仍没回视频流 → 可能误入别的页；只告警、不左滑。
    stuckAlert = "关评论后疑似未回到视频流，需人工处理";
    log("⚠ 关评论多次下滑仍未回到视频流；不自动脱困，已通知管理中心");
    onEvent?.("stuck_after_close_comments", {});
  };

  const rawOpenComments = async () => {
    await tap((await currentRail()).comment);
    await sleep(900);
  };
  const rawCloseComments = async () => {
    // 关闭 ✕ 在「评论 N | 评价 M | ✕」tab 栏（detectCommentCloseButton 已下探到那儿并跳过顶端地点横幅）。
    // 直接点真 ✕ 即关面板并收键盘（✕ 在 tab 栏、在键盘之上，不被遮挡）；关后校验真回到已知页，误进地点页
    // 即时脱困——不再像旧版那样「找不到 ✕ 就当已回 feed」，也不再先盲点 0.3H（实测落在面板外的蒙层上）。
    await closeCommentPanelSafely();
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
    getAlert: () => stuckAlert,

    async openForYou() {
      await ensure();
      page = "feed";
      railCache = null;
      lastCaption = ""; // 进新流 → 上一条文案作废，首次上划不做「同一条」判定
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
      lastCaption = "";
      log("已切到「关注」视频流");
    },

    // 上划切下一条，并**验证真的划动了**：
    //  上划后读新文案，若与上一条**高度相似**（looksSameCaption），说明多半没划动（被弹窗/可交互元素
    //  拦截了手势）→ 换个位置/加长再划，最多试 3 个位置；全试完仍是同一条 → 大概率不是上划问题，而是
    //  困在某个弹窗里 → 启动脱困（关系统弹窗 + 应用内浮层）。
    //  ⚠️ 判定依赖 OCR：上一条文案为空/过短（如未接 VisionOcr、或该视频无文案）时**无法判定**，
    //  自动退回旧的「单次上划」行为，绝不会陷入「永远判同一条 → 每次都脱困」。
    async swipeToNextVideo() {
      await ensure();
      await goTo("feed");
      const { width: w, height: h } = size;
      // 上划位置变体：验证疑似没划动时依次换位置/加长重试。
      const variants = [
        { x1: 0.5, y1: 0.72, x2: 0.5, y2: 0.26 }, // 标准（中列）
        { x1: 0.7, y1: 0.8, x2: 0.7, y2: 0.2 }, // 右列、加长
        { x1: 0.3, y1: 0.8, x2: 0.3, y2: 0.2 }, // 左列、加长
      ];
      const before = lastCaption;
      // 上一条文案够长才谈得上「是否同一条」；停止请求时不做验证（触控已 no-op，验证注定失败还白读 OCR）。
      const canVerify = isCaptionComparable(before) && !isStopping?.();

      for (let attempt = 0; attempt < variants.length; attempt++) {
        const v = variants[attempt];
        await swipe({ x: w * v.x1, y: h * v.y1 }, { x: w * v.x2, y: h * v.y2 }, 0.25);
        railCache = null; // 换视频 → 右栏可能整体上下移，下次动作重测

        if (!canVerify) {
          log("上滑切换视频");
          return; // 无法验证 → 旧行为，单次上划即返回
        }
        await sleep(500); // 等新页文案渲染再读（真机可调）
        const after = captionFromBoxes(await ocr(await screenshot()));
        if (!looksSameCaption(before, after)) {
          lastCaption = after; // 确实换了一条
          log(attempt === 0 ? "上滑切换视频" : `上滑切换视频（换第 ${attempt + 1} 个位置后成功）`);
          return;
        }
        log(`上划疑似未生效（文案高度相似），换位置重试 ${attempt + 1}/${variants.length}`);
      }

      // 多次换位置仍是同一条 → 大概率困在弹窗里 → 脱困。
      log("⚠ 多次上划文案仍相似，疑似困在弹窗，尝试脱困");
      onEvent?.("swipe_stuck_escape", {});
      await handleSystemAlert();
      await escapeAppPopup();
      lastCaption = ""; // 状态已不确定 → 清空，下次 readCurrentVideo 重新同步
    },

    async readCurrentVideo(): Promise<VideoInfo> {
      await ensure();
      await goTo("feed");
      const boxes = await ocr(await screenshot());
      const caption = captionFromBoxes(boxes);
      lastCaption = caption; // 记录当前条文案，供下次 swipeToNextVideo 判「是否划动」
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
        stuckAlert = null; // 回到已知页/已处理 → 清管理中心告警
        return;
      }
      // 再处理应用内浮层（TikTok 自有弹窗/底部单）——能自动关就关掉继续。
      if ((await escapeAppPopup()) !== "none") {
        lostStreak = 0;
        stuckAlert = null; // 回到已知页/已处理 → 清管理中心告警
        return;
      }
      const png = await screenshot();
      const img = decode(png);
      if (onKnownPage(img)) {
        lostStreak = 0;
        stuckAlert = null; // 回到已知页/已处理 → 清管理中心告警 // 视频流 / 评论区 → 正常
        return;
      }
      // 非视频流/评论区：先看是不是已知弹窗（登录/passkey）→ 关掉，算已处理。
      const text = (await ocr(png)).map((b) => b.text).join(" ");
      if (POPUP_RE.test(text)) {
        await tap(A("popupClose"));
        await sleep(700);
        log("关闭登录/passkey 弹窗");
        lostStreak = 0;
        stuckAlert = null; // 回到已知页/已处理 → 清管理中心告警
        return;
      }
      lostStreak++;
      // 防误伤：只出现一次很可能是横屏/图文帖导致动作栏漏检 → 先观察、不返回。
      if (lostStreak < 2) {
        log("可能离开正常页面（观察中，暂不返回）");
        return;
      }
      // 连续 ≥2 次仍不在正常页面 → **不再自动左滑脱困**：onKnownPage 有时把正常页误判为异常，盲目左滑
      // 反而会跳到别的页面。改为**只记日志 + 通知管理中心**，交人工/上层处理；不做任何触控、不改 page。
      // 只在「刚判定卡住」（lostStreak==2）时报一次，避免每批刷屏（lostStreak 会持续增长）。
      if (lostStreak === 2) {
        stuckAlert = "疑似卡在未知页面，需人工处理";
        log("⚠ 疑似卡在未知页面（连续多次未在正常页面）；不自动左滑（避免误判正常页而误跳），已通知管理中心待处理");
        onEvent?.("stuck_unknown_page", {});
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
      // 停止守卫：发布期间用户点了停止 → 触控已全部变 no-op，若不检查会「八步空走」伪报发布成功。
      // 每步开头查一次，命中就抛错中止，上层如实回报 failed（管理中心可重派）。
      const st = (step: string) => {
        if (isStopping?.()) throw new Error(`已请求停止，发布中止（${step}）`);
      };
      // ⚠️ 关键：发布必须从「能看到底部导航 [+]」的干净基地开始。下发时引擎可能停在**任意页**——
      // 评论区/搜索结果/作品详情/个人主页/关注流……直接点 [+] 会点偏。先复位：
      //   1) 关系统权限弹窗 + 应用内浮层；2) 关残留评论区；3) 退出「搜索结果/作品详情」等看不到底部
      //   导航的 pushed 页（不在已知页就左滑返回，最多 4 次）。这样无论从哪儿发起，都先回到基地。
      st("发布⓪");
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
      st("发布①");
      log("发布①：打开创作页（+）");
      await tap(A("publishCreate"));
      await sleep(1500);
      await settleAlerts(3); // 相机/麦克风权限（点「好」）
      st("发布②");
      log("发布②：进相册上传（左下相册图标）");
      await tap(A("publishUpload"));
      await sleep(1200);
      await settleAlerts(3); // 相册权限（点「允许访问所有照片」）
      st("发布③");
      log("发布③：选相册最新一条（= 刚下载的视频）");
      await tap(A("publishAlbumFirst"));
      await sleep(1200);
      await settleAlerts(2);
      st("发布④");
      log("发布④：下一步（预览页）");
      await tap(A("publishNext"));
      await sleep(2500);
      st("发布⑤");
      log("发布⑤：下一步（编辑页）");
      await tap(A("publishNext"));
      await sleep(1500);
      if (caption) {
        st("发布⑥");
        log("发布⑥：填写描述");
        await tap(A("publishCaption"));
        await sleep(600);
        await typeText(caption);
        await sleep(500);
      }
      st("发布⑦");
      log("发布⑦：点「发布」");
      await tap(A("publishPost"));
      await sleep(2500);
      await settleAlerts(3); // 发布后常弹「同步 Facebook 好友」等 → 拒绝（取消）
      // 发布后 TikTok 停在作品/个人主页 → 点底部「首页」回推荐流，便于养号继续/下一条发布从基地开始。
      await tap(A("homeTab"));
      await sleep(1000);
      page = "feed";
      log("发布⑧：已提交，已回推荐流");
    },
  };
}
