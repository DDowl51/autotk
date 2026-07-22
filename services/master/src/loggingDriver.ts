// 给 Driver 包一层日志:每个原子操作(点/滑/输入/切前台)都打印,含坐标 + 滑动方向箭头。
// 真机调试看"当前在做什么操作"用。screenshot 太频繁不打。纯装饰,可测。
import type { Driver, Point } from "@auto/core";

const r = (n: number): number => Math.round(n);

/** 滑动方向:竖向优先(养号主要竖滑),标注 上滑/下滑/左滑/右滑。 */
export function swipeDir(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? "↑上滑" : "↓下滑";
  return dx < 0 ? "←左滑" : "→右滑";
}

export function loggingDriver(inner: Driver, log: (msg: string) => void): Driver {
  return {
    screenshot: () => inner.screenshot(),
    windowSize: () => inner.windowSize(),
    ensureHealthy: () => inner.ensureHealthy(),
    tap: async (p) => {
      log(`👆 点 (${r(p.x)},${r(p.y)})`);
      return inner.tap(p);
    },
    swipe: async (from, to, durMs) => {
      log(`✋ 滑 ${swipeDir(from, to)} (${r(from.x)},${r(from.y)})→(${r(to.x)},${r(to.y)})`);
      return inner.swipe(from, to, durMs);
    },
    typeText: async (s) => {
      log(`⌨ 输入 "${s}"`);
      return inner.typeText(s);
    },
    activateApp: async (id) => {
      log(`📱 切前台 ${id}`);
      return inner.activateApp(id);
    },
  };
}
