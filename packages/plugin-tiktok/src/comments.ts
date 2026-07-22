// 评论解析/广告识别/匹配(纯逻辑,移植旧 commentParse.ts,适配 core 的 TextLine)。
import type { TextLine } from "@auto/core";

export interface Comment {
  author: string;
  text: string;
  /** 评论纵向中心归一化 y(定位「回复/头像」用)。 */
  y: number;
  isAd: boolean;
}

// 评论区(归一化):避开顶部缩略图和底部输入栏。
const REGION = { yMin: 0.27, yMax: 0.86, xMax: 0.78 };
// 同一条评论内相邻行的最大 y 间距;超过视为新评论。
const ROW_GAP = 0.035;

const cx = (b: TextLine["box"]): number => (b[0] + b[2]) / 2;
const cy = (b: TextLine["box"]): number => (b[1] + b[3]) / 2;

/** OCR 文字行 → 评论列表(启发式:区域过滤 → 按 y 聚类 → 首行作者)。 */
export function parseComments(lines: TextLine[]): Comment[] {
  const inRegion = lines
    .filter((l) => l.text.trim() && cx(l.box) < REGION.xMax && cy(l.box) >= REGION.yMin && cy(l.box) <= REGION.yMax)
    .sort((a, b) => a.box[1] - b.box[1]);

  const out: Comment[] = [];
  let cur: TextLine[] = [];
  const flush = (): void => {
    if (cur.length === 0) return;
    const author = cur[0].text.trim();
    const body = cur.slice(1).map((l) => l.text.trim()).filter(Boolean).join(" ");
    const first = cur[0].box;
    const last = cur[cur.length - 1].box;
    const y = (first[1] + last[3]) / 2;
    const text = body || author;
    const idx = out.length;
    out.push({ author, text, y, isAd: isAdComment(author, text, idx) });
    cur = [];
  };

  let lastTop = -1;
  for (const l of inRegion) {
    if (lastTop >= 0 && l.box[1] - lastTop > ROW_GAP) flush();
    cur.push(l);
    lastTop = l.box[1];
  }
  flush();
  return out;
}

// 广告标签(任意位置)与 CTA(仅置顶 1~2 条才算,防误伤正文顺口提及)。
const AD_LABEL = /(sponsored|promoted|paid partnership|赞助|推广|广告合作|品牌合作)/i;
const AD_CTA = /(learn more|shop now|order now|sign up now|get offer|了解更多|立即购买|马上抢购?|立即抢购|查看详情|前往购买)/i;

/** 是否推广/广告评论(index 判置顶)。绝不点赞/回复/私信。 */
export function isAdComment(author: string, text: string, index: number): boolean {
  const hay = `${author} ${text}`;
  if (AD_LABEL.test(hay)) return true;
  if (index <= 1 && AD_CTA.test(hay)) return true;
  return false;
}

/** 评论文字命中任一关键词 → 返回命中的原词;否则 null。空词表 → null(不筛选)。 */
export function matchComment(text: string, keywords: string[]): string | null {
  if (keywords.length === 0) return null;
  const hay = text.toLowerCase();
  for (const kw of keywords) {
    const k = kw.trim().toLowerCase();
    if (k && hay.includes(k)) return kw;
  }
  return null;
}

/** 去重键(作者+正文归一化)。 */
export function commentKey(c: Comment): string {
  return `${c.author}${c.text}`.replace(/\s+/g, " ").trim();
}
