// 文案相似度（纯逻辑）。用于「上划后判断是否仍是同一条视频」：
// 上划若没真的划动（被弹窗/可交互元素拦截），新读到的文案会与上一条高度相似。
// 抗 OCR 细微差异：用字符二元组(bigram) Dice 系数，而非精确相等。

/** 归一化：去所有空白 + 转小写。 */
function norm(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/** 字符二元组集合。 */
function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

/**
 * 两段文案的相似度（0~1，字符二元组 Dice 系数）。1=几乎相同，0=毫不相干。
 * 归一化后长度 <2 的按精确相等处理（相同非空→1，否则→0）。
 */
export function captionSimilarity(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  if (na.length < 2 || nb.length < 2) return na.length > 0 && na === nb ? 1 : 0;
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let inter = 0;
  for (const g of ba) if (bb.has(g)) inter++;
  return (2 * inter) / (ba.size + bb.size);
}

export interface SameCaptionOpts {
  /** 判「同一条」的相似度阈值（默认 0.85）。宁可漏判(当作已划动)，也别误判「没划动」而无谓重试/脱困。 */
  threshold?: number;
  /** 归一化后至少这么长才做相似度判定（太短不可靠，默认 6）。 */
  minLen?: number;
}

/** 文案是否足够长、可用于相似度判定（太短/为空则不可靠）。 */
export function isCaptionComparable(s: string, minLen = 6): boolean {
  return norm(s).length >= minLen;
}

/**
 * 判断「上划后仍是同一条视频」：两段文案都足够长，且相似度 ≥ 阈值。
 * 任一为空/过短 → 返回 false（无法可靠判定，按「已划动」处理，避免无谓重试/脱困——OCR 未接入时文案恒空，
 * 此处即让上划退回旧的「单次上划」行为，不会陷入「永远判同一条→每次都脱困」的死循环）。
 */
export function looksSameCaption(prev: string, cur: string, opts: SameCaptionOpts = {}): boolean {
  const threshold = opts.threshold ?? 0.85;
  const minLen = opts.minLen ?? 6;
  if (!isCaptionComparable(prev, minLen) || !isCaptionComparable(cur, minLen)) return false;
  return captionSimilarity(prev, cur) >= threshold;
}
