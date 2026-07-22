// 系统弹窗按钮意图表（英文为主，含中文）。
// 策略（真机确认）：发视频需要的**相机 / 麦克风 / 相册**权限 → 允许；
// 其余（Facebook 登录、跟踪、通知、保存到 TikTok 等）→ 拒绝 / 取消 / Not Now。

const DENY = [
  "取消",
  "不允许",
  "以后再说",
  "暂不",
  "跳过",
  "don't allow",
  "dont allow",
  "ask app not to track",
  "not now",
  "no thanks",
  "maybe later",
  "skip",
  "cancel",
  "don't save",
  "keep only while using",
];

// 允许类按钮（精确/子串）。⚠️「不允许」含「允许」子串，故匹配 ALLOW 时必须先排除 DENY 按钮，
// 否则相机/麦克风弹窗会误点「不允许」。顺序：越具体越靠前（相册「允许访问所有照片」优先）。
const ALLOW = [
  "允许访问所有照片",
  "allow access to all photos",
  "allow full access",
  "好", // iOS 中文系统弹窗的「OK」（相机/麦克风都是「好」）
  "允许",
  "always allow",
  "allow",
  "ok",
];

// 发布需要的权限（相机/麦克风/相册）→ 走 ALLOW；命中任一关键词即可。其余 → 走 DENY。
const ALLOW_HINT = /photo|photos|library|相册|照片|camera|相机|摄像|microphone|麦克风|录音/i;

export type AlertChoice = { label: string } | { dismiss: true };

// iOS 系统按钮用弯引号「Don't Allow」(U+2019)，而 DENY 表用直引号「don't allow」(U+0027)——
// 不归一化就匹配不上、漏点「不允许」。统一把各种撇号/引号折成直引号再比。
const deapos = (s: string): string => s.replace(/[‘’ʼ`´]/g, "'");

const isDeny = (l: string): boolean => DENY.some((d) => l === d || l.includes(d));

/**
 * 给定弹窗文字 + 按钮列表，决定点哪个按钮。
 * - 相机/麦克风/相册权限 → 点 ALLOW 类按钮（且排除 DENY 按钮，防「不允许」被「允许」子串命中）。
 * - 其它（Facebook/跟踪/通知…）→ 点 DENY 类按钮。
 * - 都没匹配到 → {dismiss:true}，调用方走 /alert/dismiss（通常= 取消/拒绝）。
 */
export function chooseAlertButton(text: string, buttons: string[]): AlertChoice {
  const norm = buttons.map((b) => ({ raw: b, l: deapos(b.toLowerCase().trim()) }));
  if (ALLOW_HINT.test(text)) {
    for (const w of ALLOW) {
      const wl = w.toLowerCase();
      const hit = norm.find((b) => !isDeny(b.l) && (b.l === wl || b.l.includes(wl)));
      if (hit) return { label: hit.raw };
    }
  } else {
    for (const w of DENY) {
      const wl = w.toLowerCase();
      const hit = norm.find((b) => b.l === wl || b.l.includes(wl));
      if (hit) return { label: hit.raw };
    }
  }
  return { dismiss: true };
}
