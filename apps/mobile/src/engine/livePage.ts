import type { OcrBox } from "../vision/caption";

// 判断当前是不是「推荐流里的直播卡」。遇到直播不互动、直接下滑（真机实测：直播 UI 不一样，
// 右栏是礼物面板不是白图标，硬互动会点空甚至误入直播间）。纯逻辑，喂 OCR 文字框即可。

// 直播短语（中英）：只看下半屏，避开顶部导航里那个 "LIVE" tab（它一直在，不代表当前视频是直播）。
const LIVE_PHRASE = /直播中|点击进入直播间|正在直播|tap to watch|watch\s*live|is\s*live|live\s*now|going live/i;

export function isLivePage(boxes: OcrBox[]): boolean {
  return boxes.some((b) => {
    const cy = b.y + b.h / 2;
    const t = b.text.trim();
    if (cy > 0.35 && LIVE_PHRASE.test(t)) return true;
    // 英文红色 "LIVE" 徽标：只在左下角(徽标位置)、且整串就是 LIVE 才算，避免文案里的 LIVE 误判。
    if (cy > 0.6 && b.x < 0.4 && /^live$/i.test(t)) return true;
    return false;
  });
}
