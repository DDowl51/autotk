// 生成随机 id（优先 crypto.randomUUID，回退到 Math.random + 时间戳）。RN/Hermes 也能跑。
export function randomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const rand = "xxxxxxxxxxxxxxxx".replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
  return `${rand}-${Date.now().toString(16)}`;
}
