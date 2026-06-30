import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { screenshot } from "../src/wda";
import type { Point } from "../src/wda";

export interface RailIcons {
  like: Point;
  comment: Point;
  save: Point;
  share: Point;
  /** 关注按钮（头像下方的红色 + 圆圈）；已关注或检测不到时为 null。 */
  follow: Point | null;
}

interface Px {
  r: number;
  g: number;
  b: number;
}

interface Rail {
  grid: Map<number, Map<number, Px>>;
  railX: number;
  railY: number;
  railW: number;
  railH: number;
}

const isWhite = (p: Px) => p.r > 180 && p.g > 180 && p.b > 180;
const isRed = (p: Px) => p.r > 150 && p.g < 100 && p.b < 100;
// TikTok 主题红 #FE2C55（发送按钮）。
const isTkRed = (p: Px) => p.r > 200 && p.g < 100 && p.b > 50 && p.b < 140;

/**
 * 截图后取指定逻辑区域，解析成逐像素 RGB 网格。
 * 网格坐标是区域内局部坐标，左上角对应 (ox, oy)。
 */
async function grabRegion(
  W: number,
  H: number,
  ox: number,
  oy: number,
  w: number,
  h: number,
): Promise<Map<number, Map<number, Px>>> {
  const b64 = await screenshot();
  const tmp = path.join(os.tmpdir(), `tk-${Date.now()}.png`);
  fs.writeFileSync(tmp, Buffer.from(b64, "base64"));
  let txt: string;
  try {
    txt = execFileSync(
      "magick",
      [tmp, "-resize", `${W}x${H}!`, "-crop", `${w}x${h}+${ox}+${oy}`, "+repage", "txt:-"],
      { maxBuffer: 64 * 1024 * 1024 },
    ).toString();
  } finally {
    fs.unlinkSync(tmp);
  }
  const grid = new Map<number, Map<number, Px>>();
  for (const line of txt.split("\n")) {
    const m = /^(\d+),(\d+):\s*\((\d+),(\d+),(\d+)/.exec(line);
    if (!m) continue;
    const y = +m[2];
    let row = grid.get(y);
    if (!row) grid.set(y, (row = new Map()));
    row.set(+m[1], { r: +m[3], g: +m[4], b: +m[5] });
  }
  return grid;
}

/** 截图右侧动作栏区域。 */
async function grabRail(W: number, H: number): Promise<Rail> {
  const railX = Math.round(W - 70);
  const railY = Math.round(H * 0.28);
  const railW = 68;
  const railH = Math.round(H * 0.62);
  const grid = await grabRegion(W, H, railX, railY, railW, railH);
  return { grid, railX, railY, railW, railH };
}

/**
 * 在 rail 网格里找关注红 + 的质心，限制在 y < maxLocalY 的区域内。
 * 用 isTkRed（TikTok 品牌红 #FE2C55，与 + 同色）而非宽松的 isRed，
 * 以排除头像照片里的红色内容（红衣/红 logo 等多为纯红/深红，b<50，被排除）。
 */
function redCentroid(rail: Rail, maxLocalY: number): Point | null {
  let rx = 0;
  let ry = 0;
  let n = 0;
  for (let y = 0; y < maxLocalY; y++) {
    const row = rail.grid.get(y);
    if (!row) continue;
    for (const [x, p] of row) {
      if (isTkRed(p)) {
        rx += x;
        ry += y;
        n++;
      }
    }
  }
  return n >= 20 ? { x: rail.railX + rx / n, y: rail.railY + ry / n } : null;
}

/**
 * 定位四个白色图标 + 关注红 +。用于标定（在干净未点赞、未关注的视频上）。
 */
export async function detectRail(W: number, H: number): Promise<RailIcons> {
  const rail = await grabRail(W, H);
  const { grid, railX, railY, railH } = rail;

  const bands: { y0: number; y1: number }[] = [];
  let cur: { y0: number; y1: number } | null = null;
  for (let y = 0; y < railH; y++) {
    const row = grid.get(y);
    const xs: number[] = [];
    if (row) for (const [x, p] of row) if (isWhite(p)) xs.push(x);
    const wide = xs.length >= 12 && Math.max(...xs) - Math.min(...xs) >= 14;
    if (wide) {
      if (!cur) cur = { y0: y, y1: y };
      else cur.y1 = y;
    } else if (cur) {
      if (cur.y1 - cur.y0 >= 9) bands.push(cur);
      cur = null;
    }
  }
  if (cur && cur.y1 - cur.y0 >= 9) bands.push(cur);

  if (bands.length < 4) {
    throw new Error(
      `只检测到 ${bands.length} 个白色图标带（需要 4 个）。可能不在视频页/界面异常/图标变色。`,
    );
  }
  const centerOf = (b: { y0: number; y1: number }): Point => {
    const my = (b.y0 + b.y1) >> 1;
    const row = grid.get(my) ?? grid.get(b.y0)!;
    const xs = [...row].filter(([, p]) => isWhite(p)).map(([x]) => x);
    return { x: railX + (Math.min(...xs) + Math.max(...xs)) / 2, y: railY + (b.y0 + b.y1) / 2 };
  };
  const [like, comment, save, share] = bands.slice(0, 4).map(centerOf);

  // 关注红 + 在点赞上方；限制扫描区避开可能变红的点赞心。
  const follow = redCentroid(rail, like.y - railY - 20);
  return { like, comment, save, share, follow };
}

/**
 * 仅检测关注红 + 是否存在（养号时实时判断：在才点，避免点到已关注作者的头像而跳转主页）。
 * @param likeY 标定的点赞 y，作为扫描上界以避开点赞心。
 */
export async function detectFollow(
  W: number,
  H: number,
  likeY: number,
): Promise<Point | null> {
  const rail = await grabRail(W, H);
  return redCentroid(rail, likeY - rail.railY - 20);
}

/**
 * 检测评论区里每条评论右侧的点赞爱心位置（运行时检测，因评论长度不一、爱心 y 浮动）。
 * 爱心在逻辑 x≈W-86 那一列；灰色描边(未赞)或红色(已赞)。返回从上到下的爱心中心点。
 */
export async function detectCommentHearts(
  W: number,
  H: number,
): Promise<Point[]> {
  const heartX = W - 86; // 爱心列中心（390 机型实测 ≈ 304）
  const ox = heartX - 16;
  const colW = 32;
  const oy = Math.round(H * 0.25); // 面板头部以下
  const colH = Math.round(H * 0.62); // 到底部输入栏以上
  const grid = await grabRegion(W, H, ox, oy, colW, colH);

  // 图标像素：灰色描边(90~185 且接近灰)或红色(已赞)。
  const isIcon = (p: Px) =>
    (p.r > 90 && p.r < 195 && Math.abs(p.r - p.g) < 28 && Math.abs(p.g - p.b) < 28) ||
    isRed(p);

  const cx = 16; // 爱心在该 32px 宽列里的中心局部 x
  const hearts: Point[] = [];
  let cur: { y0: number; y1: number } | null = null;
  for (let y = 0; y < colH; y++) {
    const row = grid.get(y);
    let minx = 99;
    let maxx = -1;
    if (row)
      for (const [x, p] of row)
        if (isIcon(p)) {
          if (x < minx) minx = x;
          if (x > maxx) maxx = x;
        }
    // 爱心是空心描边：中间行像素少但跨度仍宽。改用"跨度跨过中心"判定，
    // 不要求每行像素多。同时排除偏在一侧的文字/数字/关闭X。
    const iconRow = maxx - minx >= 8 && minx <= cx + 2 && maxx >= cx - 2;
    if (iconRow) {
      if (!cur) cur = { y0: y, y1: y };
      else cur.y1 = y;
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

/**
 * 检测评论面板的关闭 ✕ 按钮。面板可拖到不同高度，头部 y 随之变化，
 * 故检测「白色圆角面板的顶部」（从上往下第一行左右边缘都变白），✕ 在其右上角。
 * 返回 ✕ 的点击坐标；不在评论面板时返回 null。
 */
export async function detectCommentCloseButton(
  W: number,
  H: number,
): Promise<Point | null> {
  const oy = 90;
  const scanH = 400;
  const grid = await grabRegion(W, H, 0, oy, W, scanH);
  const isWhiteAt = (row: Map<number, Px> | undefined, x: number) => {
    const p = row?.get(x);
    return !!p && p.r > 235 && p.g > 235 && p.b > 235;
  };

  // 1) 找白色圆角面板顶（左右边缘都变白）。
  let top = -1;
  for (let ly = 0; ly < scanH; ly++) {
    const row = grid.get(ly);
    if (!row) continue;
    if (
      isWhiteAt(row, 12) &&
      isWhiteAt(row, 15) &&
      isWhiteAt(row, W - 15) &&
      isWhiteAt(row, W - 12)
    ) {
      top = ly;
      break;
    }
  }
  if (top < 0) return null;

  // 2) 在头部带内、右侧区域，取深色 ✕ 图标像素质心（运行时直接识别 ✕ 本身）。
  let sx = 0;
  let sy = 0;
  let n = 0;
  const bandEnd = Math.min(top + 60, scanH);
  for (let ly = top; ly < bandEnd; ly++) {
    const row = grid.get(ly);
    if (!row) continue;
    for (const [x, p] of row) {
      if (x > W - 50 && p.r < 120 && p.g < 120 && p.b < 120) {
        sx += x;
        sy += ly;
        n++;
      }
    }
  }
  return n >= 20 ? { x: sx / n, y: oy + sy / n } : null;
}

/**
 * 检测评论输入栏的红色发送按钮（打完字后右侧出现的 ↑ 圆）。
 * y 随键盘高度浮动，故运行时检测。扫描右侧、键盘之上区域的 TikTok 红圆。
 */
export async function detectSendButton(
  W: number,
  H: number,
): Promise<Point | null> {
  const ox = Math.round(W - 80);
  const w = 80;
  const oy = Math.round(H * 0.44);
  const h = Math.round(H * 0.26);
  const grid = await grabRegion(W, H, ox, oy, w, h);
  let rx = 0;
  let ry = 0;
  let n = 0;
  for (const [y, row] of grid)
    for (const [x, p] of row)
      if (isTkRed(p)) {
        rx += x;
        ry += y;
        n++;
      }
  return n >= 30 ? { x: ox + rx / n, y: oy + ry / n } : null;
}
