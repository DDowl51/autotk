// 几何:归一化坐标 ↔ 像素。Box 归一化 [x1,y1,x2,y2]∈[0,1];Point 像素。

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** 归一化框 [x1,y1,x2,y2]（左上、右下）。 */
export type Box = readonly [number, number, number, number];

/** 归一化框中心 → 像素点。 */
export function centerPx(box: Box, size: Size): Point {
  const [x1, y1, x2, y2] = box;
  return { x: ((x1 + x2) / 2) * size.width, y: ((y1 + y2) / 2) * size.height };
}

/** 归一化点 (rx,ry) → 像素点。 */
export function normPx(rx: number, ry: number, size: Size): Point {
  return { x: rx * size.width, y: ry * size.height };
}
