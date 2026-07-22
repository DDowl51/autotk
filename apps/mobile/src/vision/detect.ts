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

/**
 * 近似无彩(achromatic)且明显暗于白卡的像素 —— 浮层卡片右上「关闭 ✕」的描边。
 * 不同浮层的 ✕ 深浅不一：好友通知/头像卡是灰圈里的灰 ✕，位置卡是纯黑 ✕（实测 rgb(0,0,0)）。
 * 故不设下限、只要「三通道相近(无彩) 且 最大通道明显低于白」，灰与黑通吃。
 */
const isAchromaticDark = (p: Px) => {
  const mx = Math.max(p.r, p.g, p.b);
  const mn = Math.min(p.r, p.g, p.b);
  return mx - mn < 28 && mx < 190;
};

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

/**
 * 检测评论面板的关闭 ✕（先找白色面板顶，再取右上深色 ✕）。
 * ⚠️ 评论面板顶端常压着一条**地点横幅**（绿定位图标 + 地名 + 右侧「立即查看 ›」），真正的关闭 ✕ 在
 * 横幅**下方**的「评论 N | 评价 M | ✕」tab 栏（≈白 panel 顶下 0.10H）。故：
 *  ① 扫描带从白 panel 顶下探 ~0.14H（覆盖横幅 + tab 栏，旧的 top+60 够不到真 ✕，会返回 null 或落到横幅右上）；
 *  ② 把右列深色像素聚成**连续行簇**，取「最靠下、够大」的那簇——即 tab 栏 ✕（无横幅时它就是紧贴 panel 顶那唯一一簇），
 *     避免旧的「质心取全带均值」被横幅右上角的深色小簇拉偏、误点进地点页。
 * 阈值为起步值，真机核实。
 */
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

  // 右列深色行簇：逐行统计 x∈[W-50,W] 的深色像素，连续行聚成一簇，记像素质心累加值。
  type Cluster = { y1: number; sx: number; sy: number; n: number };
  const clusters: Cluster[] = [];
  let cur: Cluster | null = null;
  const bandEnd = Math.min(top + 95, scanH);
  for (let ly = top; ly < bandEnd; ly++) {
    let rowN = 0;
    let rowSx = 0;
    for (let lx = W - 50; lx < W; lx++) {
      const p = lp(img, scale, lx, oy + ly);
      if (p.r < 120 && p.g < 120 && p.b < 120) {
        rowN++;
        rowSx += lx;
      }
    }
    if (rowN > 0) {
      if (!cur) cur = { y1: ly, sx: 0, sy: 0, n: 0 };
      cur.y1 = ly;
      cur.sx += rowSx;
      cur.sy += (oy + ly) * rowN; // 累加全局 y（按行像素数加权）
      cur.n += rowN;
    } else if (cur) {
      clusters.push(cur);
      cur = null;
    }
  }
  if (cur) clusters.push(cur);

  // 取最靠下、总像素≥20 的簇（= tab 栏真 ✕；地点横幅的深色小簇在其上方，被跳过）。
  let pick: Cluster | null = null;
  for (const c of clusters) {
    if (c.n >= 20 && (!pick || c.y1 > pick.y1)) pick = c;
  }
  return pick ? { x: pick.sx / pick.n, y: pick.sy / pick.n } : null;
}

/**
 * 是否「在评论/底部面板」——只看**白色面板顶横边**（四角白、横贯屏幕），**不要求找到 ✕**。
 * 用途：空评论区会自动聚焦输入框弹键盘，此时 tab 栏 ✕ 常检测不到，但白面板顶横边仍在（键盘在底部、
 * 不遮挡面板顶）。onKnownPage 用它，避免把「评论区+键盘态」误判为「不在正常界面」。
 * ⚠️ 与 detectCommentCloseButton 同一套「白面板顶」判据；阈值起步，真机核实。
 */
export function detectCommentPanel(img: DecodedImage, W: number, H: number): boolean {
  const scale = img.width / W;
  const oy = 90;
  const scanH = 400;
  const white = (lx: number, ly: number) => {
    const p = lp(img, scale, lx, oy + ly);
    return p.r > 235 && p.g > 235 && p.b > 235;
  };
  for (let ly = 0; ly < scanH; ly++) {
    if (white(12, ly) && white(15, ly) && white(W - 15, ly) && white(W - 12, ly)) return true;
  }
  return false;
}

/**
 * 检测应用内浮层卡片右上角的关闭 ✕（灰或黑的 ✕；见 isAchromaticDark）。
 * 扫右侧竖条、上半~中部，找一小簇无彩深色像素的质心。
 * ⚠️ 阈值为起步值，真机核实；找不到（太少/太多）返回 null，调用方回退安全脱困计划。
 */
export function detectCardClose(img: DecodedImage, W: number, H: number): Point | null {
  const scale = img.width / W;
  const x0 = Math.round(W * 0.78);
  const x1 = Math.round(W * 0.93);
  const y0 = Math.round(H * 0.18);
  const y1 = Math.round(H * 0.62);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let ly = y0; ly < y1; ly++) {
    for (let lx = x0; lx < x1; lx++) {
      if (isAchromaticDark(lp(img, scale, lx, ly))) {
        sx += lx;
        sy += ly;
        n++;
      }
    }
  }
  return n >= 12 && n <= 500 ? { x: sx / n, y: sy / n } : null;
}

/**
 * 通用「模态卡」检测（不依赖 OCR / 不依赖签名）：
 *   顶部有变暗蒙层(scrim) + 下方一张白卡 + 卡片右上有深色 ✕。
 * 命中返回该 ✕ 的全局坐标，供 TikTok 层出不穷的推广浮层「识别 ✕ 就关」；否则 null。
 *
 * ⚠️ 与评论面板结构相似（都是白卡 + 右上 ✕ + 上方变暗），故调用方**只应在「非评论页 / 已迷失」时**用它，
 * 否则会把正常打开的评论区当浮层关掉。阈值为起步值，真机核实。
 *
 * 判据（逐行自上而下）：
 *  1) 卡顶：某行起，中央三点(0.25/0.5/0.75W)在其下 +8、+20px 都为白（连续白卡体）；
 *  2) 蒙层：该卡顶上方 10~40px 中央整体明显偏暗（均值 < 210，排除「纯白页」误判）；
 *  3) ✕：卡顶右上一条带内找无彩深色簇质心。
 */
export function detectModalCard(img: DecodedImage, W: number, H: number): Point | null {
  const scale = img.width / W;
  const white = (lx: number, ly: number) => {
    const p = lp(img, scale, lx, ly);
    return p.r > 235 && p.g > 235 && p.b > 235;
  };
  const x25 = Math.round(W * 0.25);
  const x50 = Math.round(W * 0.5);
  const x75 = Math.round(W * 0.75);

  let cardTop = -1;
  const yStart = Math.round(H * 0.12);
  const yEnd = Math.round(H * 0.55);
  for (let ly = yStart; ly < yEnd; ly++) {
    // 1) 卡体：中央三点在下方 +8 与 +20px 都为白。
    if (!(white(x25, ly + 8) && white(x50, ly + 8) && white(x75, ly + 8))) continue;
    if (!(white(x25, ly + 20) && white(x50, ly + 20) && white(x75, ly + 20))) continue;
    // 2) 蒙层：卡顶上方一段中央整体偏暗（排除纯白页——纯白页上方仍近白）。
    let sum = 0;
    let cnt = 0;
    for (let dy = 10; dy <= 40; dy += 6) {
      const yy = ly - dy;
      if (yy < 0) break;
      const p = lp(img, scale, x50, yy);
      sum += (p.r + p.g + p.b) / 3;
      cnt++;
    }
    if (cnt === 0 || sum / cnt >= 210) continue;
    cardTop = ly;
    break;
  }
  if (cardTop < 0) return null;

  // 3) 卡片右上角找无彩深色 ✕ 簇质心。
  const bx0 = Math.round(W * 0.8);
  const bx1 = Math.round(W * 0.96);
  const by0 = cardTop;
  const by1 = Math.min(cardTop + Math.round(H * 0.09), H);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let ly = by0; ly < by1; ly++) {
    for (let lx = bx0; lx < bx1; lx++) {
      if (isAchromaticDark(lp(img, scale, lx, ly))) {
        sx += lx;
        sy += ly;
        n++;
      }
    }
  }
  return n >= 10 && n <= 500 ? { x: sx / n, y: sy / n } : null;
}

/** 便捷：从 base64 PNG 解码（统一入口，RN 安全）。 */
export function decode(b64: string): DecodedImage {
  return decodePng(base64ToBytes(b64));
}
