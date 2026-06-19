import {
  activateApp,
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
import type { TikTokUI, VideoInfo, CommentInfo } from "./tiktok-ui";
import {
  decode,
  detectCommentCloseButton,
  detectCommentHearts,
  detectFollow,
  detectSendButton,
} from "../vision/detect";
import { captionFromBoxes, type OcrBox } from "../vision/caption";

const NOT_ADAPTED = (name: string): never => {
  throw new Error(`${name} 尚未适配`);
};
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
}): TikTokUI {
  const { profile: prof, ocr, log } = deps;
  let size = { width: prof.screen.w, height: prof.screen.h };
  let page: Page = "feed";
  let heartCache: Point[] = [];

  const ensure = async () => {
    if (!getSessionId()) {
      await createSession();
      await applyFastSettings();
    }
    await activateApp(TIKTOK_BUNDLE_ID);
    try {
      size = await windowSize();
    } catch {
      /* 用 profile 尺寸兜底 */
    }
  };

  /** 抓一张屏并解码成像素。 */
  const shot = async () => decode(await screenshot());

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
      heartCache = detectCommentHearts(await shot(), size.width, size.height);
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
      await tap({ x: size.width * 0.28, y: size.height * 0.944 });
      await sleep(800);
      await typeText(text);
      await sleep(600);
      const send = detectSendButton(await shot(), size.width, size.height);
      if (!send) return log("未检测到发送按钮，跳过回复");
      await tap(send);
      log(`已发评论：${text}`);
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
    countSearchResults: async () => 8,
    async openSearchResult(index: number) {
      await ensure();
      await goTo("feed");
      if (index > 0) {
        await swipe(
          { x: size.width * 0.5, y: size.height * 0.72 },
          { x: size.width * 0.5, y: size.height * 0.26 },
          0.25,
        );
      }
    },
    back: async () => {},

    openOwnProfile: () => NOT_ADAPTED("openOwnProfile"),
    listOwnVideos: () => NOT_ADAPTED("listOwnVideos"),
    openOwnVideo: () => NOT_ADAPTED("openOwnVideo"),

    async detectPopup() {
      return false;
    },
  };
}
