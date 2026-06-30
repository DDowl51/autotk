// 概率与随机工具。整个决策引擎的「拟人化」都建立在这些函数上。

/** 以概率 p（0~1）返回 true。p<=0 恒 false，p>=1 恒 true。 */
export function chance(p: number): boolean {
  if (p <= 0) return false;
  if (p >= 1) return true;
  return Math.random() < p;
}

/** 返回 [min, max] 闭区间内的随机整数。 */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 返回 [min, max) 区间内的随机浮点数。 */
export function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** 从数组中随机取一个元素（空数组返回 undefined）。 */
export function pick<T>(arr: readonly T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[randInt(0, arr.length - 1)];
}

/** 休眠 seconds 秒。 */
export function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/**
 * 在基准秒数上下浮动一个抖动比例，返回随机化后的秒数（不休眠）。
 * 例如 jitter(0.5, 0.3) 返回 0.35~0.65 之间的值。
 */
export function jitter(seconds: number, ratio = 0.3): number {
  const delta = seconds * ratio;
  return randFloat(seconds - delta, seconds + delta);
}

/**
 * 在基准秒数上下浮动一个抖动比例后休眠，避免机械式等距操作。
 */
export function jitterSleep(seconds: number, ratio = 0.3): Promise<void> {
  return sleep(jitter(seconds, ratio));
}
