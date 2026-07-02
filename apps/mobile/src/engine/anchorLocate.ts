import type { OcrBox } from "../vision/caption";
import type { Point } from "../wda";

// 标定时用 OCR（电脑侧 tesseract）按文字定位「有文字的固定按钮」的中心像素坐标，
// 存进 devices.json 的 anchors 覆盖——比写死比例可靠、且跨机型/跨版本。
// 例：关注 Tab（"关注"/"Following"）、发布流程的「下一步/发布」（"下一步"/"Next"/"发布"/"Post"）。
// 纯函数（不跑 OCR），OcrBox 由调用方喂入；找不到返回 null，调用方回退比例默认。

/**
 * 在 OCR 结果里按文字找一个按钮的中心像素坐标。
 * 先「整段精确等于/正则命中」，再「包含」兜底——避免评论里出现同字被误当按钮。
 * OcrBox 位置是归一化 0~1（左上原点），按 W/H 还原成像素。
 */
export function findAnchorByText(
  boxes: OcrBox[],
  patterns: Array<string | RegExp>,
  W: number,
  H: number,
): Point | null {
  const toPoint = (b: OcrBox): Point => ({ x: (b.x + b.w / 2) * W, y: (b.y + b.h / 2) * H });

  // 第一轮：精确等于（字符串）或正则命中
  for (const b of boxes) {
    const t = b.text.trim();
    for (const p of patterns) {
      if (typeof p === "string" ? t === p : p.test(t)) return toPoint(b);
    }
  }
  // 第二轮：宽松包含（仅字符串 pattern）
  for (const b of boxes) {
    const t = b.text.trim();
    for (const p of patterns) {
      if (typeof p === "string" && p.length > 0 && t.includes(p)) return toPoint(b);
    }
  }
  return null;
}
