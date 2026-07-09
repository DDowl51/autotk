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
  /** ✕ 在非标准位置（如卡片下方居中、sheet 左上）时，指定归一化关闭坐标 [rx, ry]；planDismiss 优先点它。 */
  closeAt?: readonly [number, number];
}

export interface PopupHit {
  id: string;
  dismiss: DismissKind[];
  matched: string;
  /** 见 PopupSignature.closeAt。 */
  closeAt?: readonly [number, number];
}

/** 关闭控件文字（整串精确匹配，避免把正文里的词当按钮）。复用 #4 否定词思路。 */
export const DISMISS_TEXT =
  /^\s*(✕|×|x|close|not now|no thanks|maybe later|skip|cancel|dismiss|done|not interested|got it|i see|取消|关闭|暂不|暂时不要|以后再说|稍后再说|跳过|不允许|不感兴趣|知道了|我知道了)\s*$/i;

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
  // —— 真机实测遇到的（截图核实）——
  // 推荐流：「接收好友新作品通知？」，只有「接收通知」(红，勿点)+ 卡片右上 ✕。
  {
    id: "notif-friend",
    strong: true,
    markers: [
      /接收好友新作品通知/,
      /好友新作品通知/,
      /新作品通知/,
      /friends'?\s*new\s*posts?/i,
      /notif\w*\s*(for|when)\s*friends/i,
      /get\s*notified.*friend/i,
    ],
    dismiss: ["closeIcon", "tapOutside", "back"],
  },
  // 个人主页：「你的虚拟头像，你的专属风格」，只有「开始创建」(勿点)+ 卡片右上 ✕。
  {
    id: "avatar",
    strong: true,
    markers: [/虚拟头像/, /你的专属风格/, /开始创建/, /avatar/i, /your\s*(own)?\s*style/i, /start\s*creating/i],
    dismiss: ["closeIcon", "tapOutside", "back"],
  },
  // 直播里：「虚拟物品和奖励政策更新」，底部整条「知道了」可安全点掉（英文 Got it / OK 也纳入关闭控件）。
  {
    id: "policy",
    strong: true,
    markers: [
      /虚拟物品和奖励政策/,
      /奖励政策更新/,
      /虚拟物品政策/,
      /virtual\s*items?.*(policy|reward)/i,
      /rewards?\s*policy/i,
    ],
    dismiss: ["closeText", "back"],
  },
  // 发评论后：「…在其他用户与你的评论互动时收到通知」，红「接收通知」(勿点) + 卡片右上 ✕。
  {
    id: "notif-comment",
    strong: true,
    markers: [/评论互动时收到通知/, /与你的评论互动/, /你已发布\s*\d+\s*条评论/, /interact.*with your comment/i],
    dismiss: ["closeIcon", "tapOutside", "back"],
  },
  // 个人主页：「让我们快速做个安全检查」，红「继续」(勿点) + 卡片右上 ✕。
  {
    id: "security-check",
    strong: true,
    markers: [/安全检查/, /做个安全检查/, /增强账号安全/, /个性化的安全设定/, /security\s*check(-?up)?/i],
    dismiss: ["closeIcon", "tapOutside", "back"],
  },
  // 个人主页：「若要存储通行密钥，你需要启用 iCloud 钥匙串」，蓝「设置触控ID与密码」(勿点) + 卡片右上 ✕。
  // （虽是系统 passkey 提示，但呈卡片带 ✕、WDA /alert 未必拦得到，故按应用内浮层用 ✕ 关。）
  {
    id: "passkey",
    strong: true,
    markers: [/通行密钥/, /iCloud\s*钥匙串/, /钥匙串/, /passkey/i, /icloud\s*keychain/i],
    dismiss: ["closeIcon", "tapOutside", "back"],
  },
  // TikTok 位置权限推广弹窗（两种版式，都别点「打开设置」——会跳出 TikTok 进系统设置）：
  //   版式一：底部 sheet「允许访问位置，解锁本地瑰宝」，灰「暂时不要」(安全) + 卡片右上黑 ✕；
  //   版式二：搜索结果后弹的居中模态「查看附近的相关内容和场所」，底部「取消」(安全)/「打开设置」，**无 ✕**。
  // 两版都优先点安全文字按钮（取消/暂时不要）；版式一的 ✕ 由 escapeAppPopup 的 detectCardClose 视觉定位处理，
  // 故不再放固定坐标 closeIcon（版式二无 ✕，固定坐标会点空/误触）。markers 中英文 + 两版共有正文措辞。
  {
    id: "location",
    strong: true,
    markers: [
      // 版式一
      /允许访问位置/,
      /解锁本地瑰宝/,
      /本地瑰宝/,
      /allow location access/i,
      /unlock local (gems|treasures?)/i,
      /local gems/i,
      // 版式二
      /查看附近的相关内容/,
      /相关内容和场所/,
      /附近的相关内容/,
      /nearby (relevant )?content/i,
      /nearby content and places/i,
      /relevant content and places/i,
      // 两版共有正文（iOS 位置权限专有措辞，正常页不会出现，误识别风险低）
      /使用应用期间/,
      /打开设备设置.*位置/,
      /while using the app/i,
    ],
    dismiss: ["closeText", "tapOutside", "back"],
  },
  {
    id: "follow",
    markers: [/log\s*in to follow/i, /follow back/i, /登录.*关注/],
    dismiss: ["closeText", "closeIcon", "tapOutside"],
  },
  { id: "sheet", markers: [/send to/i, /share to/i, /分享到|发送给/], dismiss: ["swipeDown", "tapOutside"] },
  // TikTok Shop 促销弹窗（Congrats! choose up to N products / Pick now），✕ 在卡片下方居中、非右上角。
  {
    id: "shop-promo",
    strong: true,
    markers: [
      /choose up to this many products/i,
      /free shipping on all your picks/i,
      /pick now/i,
      /恭喜.*可(选|挑|领)/,
      /立即(挑选|领取|领)/,
      /全部.*免(邮|运)/,
    ],
    closeAt: [0.5, 0.785], // ✕ 在卡片下方居中
    dismiss: ["back"],
  },
  // 误点广告后弹出的内嵌网页 sheet（Scroll up for fullscreen / Sign in to continue / 某域名）。
  // ⚠️ 绝不能上滑（会进外部页）——只点左上 ✕。
  {
    id: "inapp-browser",
    strong: true,
    markers: [
      /scroll up for full\s?screen/i,
      /full\s?screen view/i, // OCR 可能把「Scroll up for fullscreen view」拆行，单独兜一句
      /上滑查看全屏/,
      /查看全屏/,
      /sign in to continue/i,
      /sign in is required/i,
      /登录后.*继续/,
    ],
    closeAt: [0.07, 0.755], // 左上 ✕
    dismiss: [], // 只点左上 ✕，不加任何 swipe/back 兜底（防上滑进外部页）
  },
];

/** 是否存在可点的关闭控件。 */
export function hasDismissControl(boxes: OcrBox[]): boolean {
  return boxes.some((b) => !inActionRail(b) && DISMISS_TEXT.test(b.text.trim()));
}

// iOS 系统权限弹窗的「拒绝」按钮整串（Don't Allow / 不允许）。don.?t 容忍直/弯撇号或无撇号。
const PERMISSION_DENY = /^\s*(don.?t\s*allow|不允许)\s*$/i;

/**
 * 找系统权限弹窗的「拒绝」按钮框（Don't Allow / 不允许），OCR 兜底用。
 * WDA /alert 读不到某些系统弹窗（如带地图的定位权限，由 springboard 渲染、会话读不到），
 * 此时靠整屏 OCR 找到这个按钮直接点。养号期一律拒绝权限是安全的（不发布），见到即可点。
 * 整串精确匹配 + 避开右侧动作栏，避免把正文里的词误当按钮。
 */
export function findPermissionDenyBox(boxes: OcrBox[]): OcrBox | null {
  return boxes.find((b) => !inActionRail(b) && PERMISSION_DENY.test(b.text.trim())) ?? null;
}

/** 检测应用内浮层；命中返回 PopupHit，否则 null。 */
export function detectAppPopup(boxes: OcrBox[], signatures: PopupSignature[] = SIGNATURES): PopupHit | null {
  const dismissPresent = hasDismissControl(boxes);
  for (const sig of signatures) {
    for (const b of boxes) {
      if (inActionRail(b)) continue;
      const t = b.text.trim();
      if (sig.markers.some((re) => re.test(t)) && (sig.strong || dismissPresent)) {
        return { id: sig.id, dismiss: sig.dismiss, matched: t, closeAt: sig.closeAt };
      }
    }
  }
  return null;
}
