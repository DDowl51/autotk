import {
  activateApp,
  createSession,
  getSessionId,
  source,
  swipe,
  tap,
  TIKTOK_BUNDLE_ID,
  windowSize,
} from "../wda";
import type { Point } from "../wda";
import type { TikTokUI, VideoInfo } from "./tiktok-ui";

type Log = (msg: string) => void;

/** 把 XML 实体还原成普通文本。 */
function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

interface El {
  type: string;
  name: string;
  label: string;
  accessible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 把 WDA 的界面元素树 XML 解析成扁平元素列表（含坐标）。
 * 一次抓取即可拿到所有按钮的坐标，按坐标点击，避免按元素引用点击时
 * 因同名元素过多触发的「Identity Binding」失败，也大幅减少往返次数。
 */
function parseElements(xml: string): El[] {
  const tagRe = /<(XCUIElementType\w+)\b([^>]*?)\/?>/g;
  const out: El[] = [];
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml)) !== null) {
    const attrs = m[2];
    const get = (k: string) => {
      const mm = new RegExp(`\\b${k}="([^"]*)"`).exec(attrs);
      return mm ? mm[1] : "";
    };
    const num = (k: string) => {
      const v = get(k);
      return v === "" ? NaN : parseInt(v, 10);
    };
    out.push({
      type: m[1],
      name: decode(get("name")),
      label: decode(get("label")),
      accessible: get("accessible") === "true",
      x: num("x"),
      y: num("y"),
      width: num("width"),
      height: num("height"),
    });
  }
  return out;
}

// 明显不是文案的可见文本（音乐/原声/系统提示等）。
const NON_CAPTION =
  /^(Sound |original sound|Contains:|House featuring|liveMarkView$|New$|Add song$|Pre-save$|Show captions$|Similar posts)/i;

const NOT_ADAPTED = (name: string): never => {
  throw new Error(`TikTokUI.${name} 待适配（需要对应界面的元素树）`);
};

/**
 * 真机版 TikTokUI：抓一次界面元素树 → 解析坐标 → 按坐标操作 TikTok 国际版。
 *
 * 已适配：推荐页浏览 + 视频级互动（点赞/收藏/关注/打开评论/读取文案/切换视频）。
 * 待适配（需对应界面元素树）：评论列表互动、搜索页、个人主页。
 */
export function createWdaUI(log: Log): TikTokUI {
  let size = { width: 390, height: 844 };
  let sized = false;

  const center = (e: El): Point => ({
    x: e.x + e.width / 2,
    y: e.y + e.height / 2,
  });

  /** 元素是否落在屏幕内（屏外被回收的 cell 其按钮坐标为 (0,0)）。 */
  const onScreen = (e: El) =>
    e.width > 0 && e.x > 0 && e.y > 0 && e.y < size.height;

  /**
   * 确保 TikTok 在前台（WDA 的操作只作用于前台 app），并取一次屏幕尺寸。
   */
  const ensure = async () => {
    if (!getSessionId()) await createSession(); // 空会话，建得快
    await activateApp(TIKTOK_BUNDLE_ID);
    if (!sized) {
      try {
        size = await windowSize();
        sized = true;
      } catch {
        /* 用默认尺寸兜底 */
      }
    }
  };

  /** 抓取当前界面并解析。 */
  const snapshot = async () => parseElements(await source());

  /** 在当前界面找到屏内、name 完全匹配的元素。 */
  const findByName = (els: El[], name: string) =>
    els.find((e) => e.name === name && onScreen(e));

  return {
    async openForYou() {
      await ensure();
      const els = await snapshot();
      const foryou = findByName(els, "top_tabs_recomend");
      if (foryou) await tap(center(foryou));
      log("已切到 TikTok 推荐页");
    },

    async swipeToNextVideo() {
      await ensure();
      const { width: w, height: h } = size;
      await swipe({ x: w * 0.5, y: h * 0.72 }, { x: w * 0.5, y: h * 0.26 }, 0.25);
      log("已上滑切换视频");
    },

    async readCurrentVideo(): Promise<VideoInfo> {
      await ensure();
      const els = await snapshot();
      // 文案 = 屏内、可访问、非音乐/系统类、name 最长的 Other。
      let caption = "";
      for (const e of els) {
        if (e.type !== "XCUIElementTypeOther" || !e.accessible || !onScreen(e))
          continue;
        const text = e.name.trim();
        if (!text || NON_CAPTION.test(text)) continue;
        if (text.length > caption.length) caption = text;
      }
      const tags = caption
        .split(/\s+/)
        .map((t) => t.replace(/^#/, ""))
        .filter(Boolean);
      log(caption ? `读取到文案：${caption}` : "未读取到文案");
      return { caption, tags };
    },

    async likeVideo() {
      await ensure();
      const btn = findByName(await snapshot(), "feedLikeButton");
      if (!btn) return log("未找到点赞按钮");
      if (/^Like video/i.test(btn.label)) {
        await tap(center(btn));
        log("已点赞");
      } else {
        log(`视频已点赞，跳过（label: ${btn.label}）`);
      }
    },

    async saveVideo() {
      await ensure();
      const btn = findByName(await snapshot(), "feedFavoriteButton");
      if (!btn) return log("未找到收藏按钮");
      if (/^Add to Favorites/i.test(btn.label)) {
        await tap(center(btn));
        log("已收藏");
      } else {
        log(`视频已收藏，跳过（label: ${btn.label}）`);
      }
    },

    async followAuthor() {
      await ensure();
      const els = await snapshot();
      // 关注按钮形如 "Follow xxx"；已关注后按钮消失。
      const btn = els.find(
        (e) => e.name.startsWith("Follow ") && onScreen(e),
      );
      if (btn) {
        await tap(center(btn));
        log("已关注作者");
      } else {
        log("已关注或无关注按钮，跳过");
      }
    },

    async openComments() {
      await ensure();
      const btn = findByName(await snapshot(), "feedCommentButton");
      if (!btn) throw new Error("未找到评论按钮");
      await tap(center(btn));
      log("已打开评论区");
    },

    async closeComments() {
      await ensure();
      const { width: w, height: h } = size;
      await swipe({ x: w * 0.5, y: h * 0.45 }, { x: w * 0.5, y: h * 0.95 }, 0.3);
      log("已关闭评论区");
    },

    listComments: () => NOT_ADAPTED("listComments"),
    likeComment: () => NOT_ADAPTED("likeComment"),
    replyComment: () => NOT_ADAPTED("replyComment"),

    search: () => NOT_ADAPTED("search"),
    countSearchResults: () => NOT_ADAPTED("countSearchResults"),
    openSearchResult: () => NOT_ADAPTED("openSearchResult"),
    back: () => NOT_ADAPTED("back"),

    openOwnProfile: () => NOT_ADAPTED("openOwnProfile"),
    listOwnVideos: () => NOT_ADAPTED("listOwnVideos"),
    openOwnVideo: () => NOT_ADAPTED("openOwnVideo"),

    async detectPopup() {
      const els = await snapshot();
      return els.some((e) => /isn.t available/i.test(e.label));
    },
  };
}
