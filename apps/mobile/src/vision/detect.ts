import { decodePng, pixel, base64ToBytes, type DecodedImage } from "./png";
import type { Point } from "../wda";
import { looksLikeIconRow } from "../engine/railCheck";

// 纯 JS 版图像检测，逻辑与 tools/railDetect.ts 一致，但直接读解码后的像素，
// 不依赖 ImageMagick，可在 RN 端运行（截图 → pako 解码 → 这里分析）。

interface Px {
  r: number;
  g: number;
  b: number;
}

const isWhite = (p: Px) => p.r > 180 && p.g > 180 && p.b > 180;
const isRed = (p: Px) => p.r > 150 && p.g < 100 && p.b < 100;
const isTkRed = (p: Px) => p.r > 200 && p.g < 100 && p.b > 50 && p.b < 140;

/** 在逻辑坐标 (lx,ly) 处采样（全分辨率最近邻）。 */
function lp(img: DecodedImage, scale: number, lx: number, ly: number): Px {
  return pixel(img, Math.round(lx * scale), Math.round(ly * scale));
}

export interface RailIcons {
  like: Point;
  comment: Point;
  save: Point;
  share: Point;
  follow: Point | null;
}

/**
 * 扫右栏白色图标带，返回从上到下每个带的中心点（全局坐标）。
 * 容忍数量≠4（点赞变红/已收藏等只会少一个白带）——供运行时重定位用；标定用 detectRail 要求 4 个。
 */
export function railBandCenters(img: DecodedImage, W: number, H: number): Point[] {
  const scale = img.width / W;
  const railX = Math.round(W - 70);
  const railY = Math.round(H * 0.28);
  const railW = 68;
  const railH = Math.round(H * 0.62);

  const bands: { y0: number; y1: number }[] = [];
  let cur: { y0: number; y1: number } | null = null;
  for (let ly = 0; ly < railH; ly++) {
    const xs: number[] = [];
    for (let lx = 0; lx < railW; lx++) {
      if (isWhite(lp(img, scale, railX + lx, railY + ly))) xs.push(lx);
    }
    const wide = looksLikeIconRow(xs, railW);
    if (wide) {
      if (!cur) cur = { y0: ly, y1: ly };
      else cur.y1 = ly;
    } else if (cur) {
      if (cur.y1 - cur.y0 >= 9) bands.push(cur);
      cur = null;
    }
  }
  if (cur && cur.y1 - cur.y0 >= 9) bands.push(cur);

  return bands.map((b) => {
    const my = (b.y0 + b.y1) >> 1;
    const xs: number[] = [];
    for (let lx = 0; lx < railW; lx++) {
      if (isWhite(lp(img, scale, railX + lx, railY + my))) xs.push(lx);
    }
    return { x: railX + (Math.min(...xs) + Math.max(...xs)) / 2, y: railY + (b.y0 + b.y1) / 2 };
  });
}

/** 定位四个白色图标 + 关注红 +（标定用，干净未点赞未关注的视频）。 */
export function detectRail(img: DecodedImage, W: number, H: number): RailIcons {
  const scale = img.width / W;
  const railX = Math.round(W - 70);
  const railY = Math.round(H * 0.28);
  const railW = 68;
  const centers = railBandCenters(img, W, H);
  if (centers.length < 4) {
    throw new Error(`只检测到 ${centers.length} 个白色图标带（需要 4 个）`);
  }
  const [like, comment, save, share] = centers.slice(0, 4);
  // 关注红 + 在点赞上方；扫描区上界避开可能变红的点赞心。
  const follow = redCentroid(img, scale, railX, railY, railW, like.y - railY - 20);
  return { like, comment, save, share, follow };
}

/**
 * 在 rail 区域内、局部 y < maxLocalY 范围找关注红 + 的质心。
 * 用 isTkRed（TikTok 品牌红 #FE2C55，与 + 同色）而非宽松的 isRed，
 * 以排除头像照片里的红色内容（红衣/红 logo 等多为纯红/深红，b<50，被排除）。
 */
function redCentroid(
  img: DecodedImage,
  scale: number,
  railX: number,
  railY: number,
  railW: number,
  maxLocalY: number,
): Point | null {
  let rx = 0;
  let ry = 0;
  let n = 0;
  for (let ly = 0; ly < maxLocalY; ly++) {
    for (let lx = 0; lx < railW; lx++) {
      if (isTkRed(lp(img, scale, railX + lx, railY + ly))) {
        rx += railX + lx;
        ry += railY + ly;
        n++;
      }
    }
  }
  return n >= 20 ? { x: rx / n, y: ry / n } : null;
}

/** 仅检测关注红 +（运行时判断在不在）。 */
export function detectFollow(
  img: DecodedImage,
  W: number,
  H: number,
  likeY: number,
): Point | null {
  const scale = img.width / W;
  const railX = Math.round(W - 70);
  const railY = Math.round(H * 0.28);
  const railW = 68;
  return redCentroid(img, scale, railX, railY, railW, likeY - railY - 20);
}

/** 检测评论区每条评论右侧的点赞爱心位置（空心描边，按跨度跨中心判定）。 */
export function detectCommentHearts(
  img: DecodedImage,
  W: number,
  H: number,
): Point[] {
  const scale = img.width / W;
  const heartX = W - 86;
  const ox = heartX - 16;
  const colW = 32;
  const oy = Math.round(H * 0.25);
  const colH = Math.round(H * 0.62);
  const cx = 16;

  const isIcon = (p: Px) =>
    (p.r > 90 && p.r < 195 && Math.abs(p.r - p.g) < 28 && Math.abs(p.g - p.b) < 28) ||
    isRed(p);

  const hearts: Point[] = [];
  let cur: { y0: number; y1: number } | null = null;
  for (let ly = 0; ly < colH; ly++) {
    let minx = 99;
    let maxx = -1;
    for (let lx = 0; lx < colW; lx++) {
      if (isIcon(lp(img, scale, ox + lx, oy + ly))) {
        if (lx < minx) minx = lx;
        if (lx > maxx) maxx = lx;
      }
    }
    const iconRow = maxx - minx >= 8 && minx <= cx + 2 && maxx >= cx - 2;
    if (iconRow) {
      if (!cur) cur = { y0: ly, y1: ly };
      else cur.y1 = ly;
    } else if (cur) {
      const h = cur.y1 - cur.y0;
      if (h >= 9 && h <= 34) hearts.push({ x: heartX, y: oy + (cur.y0 + cur.y1) / 2 });
      cur = null;
    }
  }
  if (cur) {
    const h = cur.y1 - cur.y0;
    if (h >= 9 && h <= 34) hearts.push({ x: heartX, y: oy + (cur.y0 + cur.y1) / 2 });
  }
  return hearts;
}

/** 检测评论输入栏的红色发送按钮（↑ 圆）。 */
export function detectSendButton(
  img: DecodedImage,
  W: number,
  H: number,
): Point | null {
  const scale = img.width / W;
  const ox = Math.round(W - 80);
  const w = 80;
  const oy = Math.round(H * 0.44);
  const h = Math.round(H * 0.26);
  let rx = 0;
  let ry = 0;
  let n = 0;
  for (let ly = 0; ly < h; ly++) {
    for (let lx = 0; lx < w; lx++) {
      if (isTkRed(lp(img, scale, ox + lx, oy + ly))) {
        rx += ox + lx;
        ry += oy + ly;
        n++;
      }
    }
  }
  return n >= 30 ? { x: rx / n, y: ry / n } : null;
}

/** 检测评论面板的关闭 ✕（先找白色面板顶，再取右上深色 ✕ 质心）。 */
export function detectCommentCloseButton(
  img: DecodedImage,
  W: number,
  H: number,
): Point | null {
  const scale = img.width / W;
  const oy = 90;
  const scanH = 400;
  const white = (lx: number, ly: number) => {
    const p = lp(img, scale, lx, oy + ly);
    return p.r > 235 && p.g > 235 && p.b > 235;
  };

  let top = -1;
  for (let ly = 0; ly < scanH; ly++) {
    if (white(12, ly) && white(15, ly) && white(W - 15, ly) && white(W - 12, ly)) {
      top = ly;
      break;
    }
  }
  if (top < 0) return null;

  let sx = 0;
  let sy = 0;
  let n = 0;
  const bandEnd = Math.min(top + 60, scanH);
  for (let ly = top; ly < bandEnd; ly++) {
    for (let lx = W - 50; lx < W; lx++) {
      const p = lp(img, scale, lx, oy + ly);
      if (p.r < 120 && p.g < 120 && p.b < 120) {
        sx += lx;
        sy += oy + ly; // 累加全局 y
        n++;
      }
    }
  }
  return n >= 20 ? { x: sx / n, y: sy / n } : null;
}

/**
 * 检测应用内浮层卡片右上角的关闭 ✕（浅灰圆里的灰色 ✕）。
 * 扫右侧竖条、上半~中部，找一小簇「灰、明显暗于白卡但非纯黑、非彩色」的像素质心。
 * ⚠️ 阈值为起步值，真机核实；找不到（太少/太多）返回 null，调用方回退安全脱困计划。
 */
export function detectCardClose(img: DecodedImage, W: number, H: number): Point | null {
  const scale = img.width / W;
  const x0 = Math.round(W * 0.78);
  const x1 = Math.round(W * 0.93);
  const y0 = Math.round(H * 0.18);
  const y1 = Math.round(H * 0.62);
  const isGreyX = (p: Px) => {
    const mx = Math.max(p.r, p.g, p.b);
    const mn = Math.min(p.r, p.g, p.b);
    return mx - mn < 24 && p.r > 70 && p.r < 185;
  };
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let ly = y0; ly < y1; ly++) {
    for (let lx = x0; lx < x1; lx++) {
      if (isGreyX(lp(img, scale, lx, ly))) {
        sx += lx;
        sy += ly;
        n++;
      }
    }
  }
  return n >= 12 && n <= 500 ? { x: sx / n, y: sy / n } : null;
}

/** 便捷：从 base64 PNG 解码（统一入口，RN 安全）。 */
export function decode(b64: string): DecodedImage {
  return decodePng(base64ToBytes(b64));
}
