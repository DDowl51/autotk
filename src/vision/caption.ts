/** OCR 识别到的一段文字 + 归一化(0~1)位置（左上原点）。与原生模块 TextBox 同形。 */
export interface OcrBox {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// 文案区（归一化）：左下一条带，避开右侧操作栏。与 tools/ocr.ts 的裁剪占比一致。
const BAND = { xMax: 0.72, yMin: 0.77, yMax: 0.9 };

/**
 * 从整屏 OCR 结果里挑出视频文案：取落在左下文案带内的文字，
 * 按从上到下、从左到右拼接。作者名/音乐/右侧计数等被区域过滤掉。
 */
export function captionFromBoxes(boxes: OcrBox[]): string {
  const inBand = boxes.filter((b) => {
    const cy = b.y + b.h / 2;
    return b.x < BAND.xMax && cy >= BAND.yMin && cy <= BAND.yMax;
  });
  inBand.sort((a, b) => (Math.abs(a.y - b.y) > 0.01 ? a.y - b.y : a.x - b.x));
  return inBand
    .map((b) => b.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
