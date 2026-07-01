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
