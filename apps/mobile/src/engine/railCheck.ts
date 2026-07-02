import type { Point } from "../wda";

// 标定正确性校验 + 无精确档时的最接近选择（纯逻辑，便于单测）。
// 解决审计发现：detectRail 只要凑够 4 个白带就静默存档，认错图标也不报错。

export interface RailForCheck {
  like: Point;
  comment: Point;
  save: Point;
  share: Point;
}

/**
 * 校验标定出的右栏四点是否「像样」：靠右缘、同一竖列、y 从上到下递增、间距均匀、落在合理区间。
 * 任一不满足即判非法（多半是把别的白图标当成了动作栏）。
 */
export function validateRail(r: RailForCheck, w: number, h: number): { ok: boolean; reason?: string } {
  const xs = [r.like.x, r.comment.x, r.save.x, r.share.x];
  const ys = [r.like.y, r.comment.y, r.save.y, r.share.y];

  if (xs.some((x) => x < w * 0.8)) return { ok: false, reason: "有图标 x 不在屏幕右缘（<80% 宽），疑似认错图标" };
  if (Math.max(...xs) - Math.min(...xs) > w * 0.06) return { ok: false, reason: "四点 x 不在同一竖列（跨度 >6% 宽）" };
  for (let i = 1; i < ys.length; i++) {
    if (ys[i] <= ys[i - 1]) return { ok: false, reason: "四点 y 未从上到下递增，顺序异常" };
  }
  const gaps = [ys[1] - ys[0], ys[2] - ys[1], ys[3] - ys[2]];
  const avg = (gaps[0] + gaps[1] + gaps[2]) / 3;
  if (avg <= 0) return { ok: false, reason: "间距非正" };
  if (gaps.some((g) => g < avg * 0.4 || g > avg * 2.2)) return { ok: false, reason: "四点间距不均匀，疑似混入非动作图标" };
  if (ys.some((y) => y < h * 0.2 || y > h * 0.95)) return { ok: false, reason: "有图标 y 超出动作栏合理区间" };
  return { ok: true };
}

/**
 * 一行白像素是否像「图标行」而非亮场背景（抗白背景误检）：
 * 需够宽（≥12 个白像素、跨度≥14）；且白像素**不从最左贯通到最右**——
 * 若两侧都没有非白边距，多半是白墙/雪景等亮场背景整行发白，不是图标。
 */
export function looksLikeIconRow(whiteXs: number[], railW: number): boolean {
  if (whiteXs.length < 12) return false;
  const min = Math.min(...whiteXs);
  const max = Math.max(...whiteXs);
  if (max - min < 14) return false;
  const edge = 4;
  if (min <= edge && max >= railW - 1 - edge) return false; // 边到边 = 白背景，弃
  return true;
}

/**
 * 运行时重定位：右栏图标逐视频整体上下浮动 ±~25px（因文案长短），而标定存的是某一个视频的绝对 y。
 * 用当前检测到的白带 y 列表，估计右栏相对标定时的整体竖直偏移 dy，运行时把标定坐标整体平移 dy 再点。
 * 做法：每个检测带对齐到最近的标定带、取匹配差的中位数（抗个别带缺失/多余，如点赞变红少一带）。
 * 匹配到的带 <2 或偏移超出 maxShift → 返回 null（不敢调，调用方回退用原标定坐标）。
 */
export function railOffsetY(storedYs: number[], detectedYs: number[], maxShift = 60): number | null {
  if (storedYs.length === 0 || detectedYs.length === 0) return null;
  const diffs: number[] = [];
  for (const d of detectedYs) {
    let best = Infinity;
    for (const s of storedYs) {
      const diff = d - s;
      if (Math.abs(diff) < Math.abs(best)) best = diff;
    }
    if (Number.isFinite(best) && Math.abs(best) <= maxShift) diffs.push(best);
  }
  if (diffs.length < 2) return null; // 至少两个带对上才敢整体平移
  diffs.sort((a, b) => a - b);
  const mid = Math.floor(diffs.length / 2);
  return diffs.length % 2 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
}

/**
 * 无精确档（WxH）时，从已有档案 key 里挑最接近的：宽高比优先（坐标比例主要随比例走），面积次之。
 * 纯字符串数学，不点错也总比盲取第一个强。无可解析 key 时返回 null。
 */
export function nearestProfileKey(keys: string[], w: number, h: number): string | null {
  const parsed = keys
    .map((k) => {
      const m = /^(\d+)x(\d+)$/.exec(k);
      return m ? { k, w: +m[1], h: +m[2] } : null;
    })
    .filter((v): v is { k: string; w: number; h: number } => !!v);
  if (parsed.length === 0) return null;

  const ar = w / h;
  const area = w * h;
  let best = parsed[0];
  let bestScore = Infinity;
  for (const p of parsed) {
    const arDiff = Math.abs(p.w / p.h - ar);
    const areaDiff = Math.abs(p.w * p.h - area) / area;
    const score = arDiff * 10 + areaDiff; // 宽高比权重更高
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best.k;
}
