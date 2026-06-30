import type { OcrBox } from "../vision/caption";

// 应用内浮层检测（纯逻辑）。给 OCR 文字框 → 判断是否有已知干扰浮层。
// 抗误判三招：① 忽略右侧动作栏文字；② 强标题词单命中即可，普通词需配合"关闭控件"；③ 关闭控件用整串精确匹配。
// 系统弹窗(权限/passkey)不在此列——那走 WDA /alert。

export type DismissKind = "closeText" | "closeIcon" | "swipeDown" | "tapOutside" | "back";

export interface PopupSignature {
  id: string;
  markers: RegExp[];
  /** markers 是否为强标题（强→单命中即判定；否则需同时存在关闭控件）。 */
  strong?: boolean;
  /** 关闭计划（按序尝试）。 */
  dismiss: DismissKind[];
}

export interface PopupHit {
  id: string;
  dismiss: DismissKind[];
  matched: string;
}

/** 关闭控件文字（整串精确匹配，避免把正文里的词当按钮）。复用 #4 否定词思路。 */
export const DISMISS_TEXT =
  /^\s*(✕|×|x|close|not now|no thanks|maybe later|skip|cancel|dismiss|done|not interested|取消|关闭|暂不|以后再说|跳过|不允许|不感兴趣)\s*$/i;

/** 右侧动作栏（点赞/评论计数等），其文字永远不算浮层标记。 */
export function inActionRail(b: OcrBox): boolean {
  return b.x + b.w / 2 > 0.85;
}

/** 起步签名表（真机按实际界面增删/调词）。 */
export const SIGNATURES: PopupSignature[] = [
  {
    id: "login",
    strong: true,
    markers: [/log\s*in to tiktok/i, /sign\s*up for tiktok/i, /登录后(即可|才能)?/, /注册\s*(tiktok|抖音)/i],
    dismiss: ["closeText", "closeIcon", "back"],
  },
  {
    id: "notif",
    markers: [/turn on notifications/i, /开启(推送|通知)/, /don'?t miss out/i],
    dismiss: ["closeText", "closeIcon", "back"],
  },
  { id: "addyours", strong: true, markers: [/add yours/i, /添加你的/], dismiss: ["closeIcon", "back"] },
  {
    id: "follow",
    markers: [/log\s*in to follow/i, /follow back/i, /登录.*关注/],
    dismiss: ["closeText", "closeIcon", "tapOutside"],
  },
  { id: "sheet", markers: [/send to/i, /share to/i, /分享到|发送给/], dismiss: ["swipeDown", "tapOutside"] },
];

/** 是否存在可点的关闭控件。 */
export function hasDismissControl(boxes: OcrBox[]): boolean {
  return boxes.some((b) => !inActionRail(b) && DISMISS_TEXT.test(b.text.trim()));
}

/** 检测应用内浮层；命中返回 PopupHit，否则 null。 */
export function detectAppPopup(boxes: OcrBox[], signatures: PopupSignature[] = SIGNATURES): PopupHit | null {
  const dismissPresent = hasDismissControl(boxes);
  for (const sig of signatures) {
    for (const b of boxes) {
      if (inActionRail(b)) continue;
      const t = b.text.trim();
      if (sig.markers.some((re) => re.test(t)) && (sig.strong || dismissPresent)) {
        return { id: sig.id, dismiss: sig.dismiss, matched: t };
      }
    }
  }
  return null;
}
