// 拟人化随机(精确复刻旧 random.ts 语义)。rng 可注入,便于确定性单测。
export type Rng = () => number;
const DEFAULT_RNG: Rng = Math.random;

/** 以概率 p 返回 true。p<=0 恒 false;p>=1 恒 true;否则 rng()<p。 */
export function chance(p: number, rng: Rng = DEFAULT_RNG): boolean {
  if (p <= 0) return false;
  if (p >= 1) return true;
  return rng() < p;
}

/** [min,max) 随机浮点。 */
export function randFloat(min: number, max: number, rng: Rng = DEFAULT_RNG): number {
  return min + rng() * (max - min);
}

/** [min,max] 闭区间随机整数。 */
export function randInt(min: number, max: number, rng: Rng = DEFAULT_RNG): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * 拟人化抖动:返回秒数(不休眠),= [seconds*(1-ratio), seconds*(1+ratio))。
 * 默认 ratio=0.3 → ±30%。所有等距停顿都过它。
 */
export function jitter(seconds: number, ratio = 0.3, rng: Rng = DEFAULT_RNG): number {
  return randFloat(seconds * (1 - ratio), seconds * (1 + ratio), rng);
}

/** 数组随机取一(空数组→undefined)。 */
export function pick<T>(arr: readonly T[], rng: Rng = DEFAULT_RNG): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[randInt(0, arr.length - 1, rng)];
}
