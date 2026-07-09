import type { OcrBox } from "../vision/caption";

export interface ParsedComment {
  /** 评论作者（聚类首行，可能混入时间/赞数，匹配/@ 用 includes 容忍）。 */
  author: string;
  /** 评论正文（聚类其余行拼接）。 */
  text: string;
  /** 该条评论纵向中心的归一化 y（0~1），用于定位"回复"入口。 */
  y: number;
}

// 评论区文字区域（归一化，避开顶部视频缩略图和底部输入栏）。【阈值待真机调】
const REGION = { yMin: 0.27, yMax: 0.86, xMax: 0.78 };
// 同一条评论内相邻文字行的最大 y 间距；超过则视为新评论。【待真机调】
const ROW_GAP = 0.035;

/**
 * 把 VisionOcr 文字框聚合成评论列表（纯逻辑，阈值需真机调）。
 * 启发式：限定评论区域 → 按 y 排序 → y 间距 > ROW_GAP 处切成一条条 →
 *   每条首行当作者、其余当正文。用户名/时间/点赞数可能混入，匹配用 includes 容忍。
 */
export function parseComments(boxes: OcrBox[]): ParsedComment[] {
  const inRegion = boxes
    .filter((b) => {
      const cy = b.y + b.h / 2;
      return b.x < REGION.xMax && cy >= REGION.yMin && cy <= REGION.yMax && !!b.text.trim();
    })
    .sort((a, b) => a.y - b.y);

  const comments: ParsedComment[] = [];
  let cur: OcrBox[] = [];
  const flush = () => {
    if (cur.length === 0) return;
    const author = cur[0].text.trim();
    const body = cur.slice(1).map((b) => b.text.trim()).filter(Boolean).join(" ");
    const last = cur[cur.length - 1];
    const y = (cur[0].y + last.y + last.h) / 2;
    comments.push({ author, text: body || author, y });
    cur = [];
  };

  let lastY = -1;
  for (const b of inRegion) {
    if (lastY >= 0 && b.y - lastY > ROW_GAP) flush();
    cur.push(b);
    lastY = b.y;
  }
  flush();
  return comments;
}

// 广告/推广评论识别（TikTok 会在评论区置顶一条广告，带蓝色 CTA「Learn more」，绝不能点/回复它）。
/** 明确的推广标签词（作者或正文里出现即判广告，位置不限）。 */
const AD_LABEL = /(sponsored|promoted|paid partnership|赞助|推广|广告合作|品牌合作)/i;
/** 广告落地页 CTA（蓝字按钮）。这类词日常评论也可能出现，故只在置顶 1~2 条上才当广告信号，避免误伤。 */
const AD_CTA =
  /(learn more|shop now|order now|sign up now|get offer|了解更多|立即购买|马上抢购?|立即抢购|查看详情|前往购买)/i;

/**
 * 判断一条评论是否是推广/广告条（纯逻辑）。
 * - 明确标签词（sponsored/赞助/推广…）→ 任意位置都算广告。
 * - CTA 词（learn more/了解更多…）→ 仅置顶 1~2 条算（TikTok 广告评论恒置顶），降低把正文里
 *   顺口说「learn more」的普通评论误判成广告的概率。用户强调「不要误识别」。
 */
export function isAdComment(c: ParsedComment, index: number): boolean {
  const hay = `${c.author} ${c.text}`;
  if (AD_LABEL.test(hay)) return true;
  if (index <= 1 && AD_CTA.test(hay)) return true;
  return false;
}

/** 评论文字命中任一匹配词 → 返回命中的词；否则 null。空词表 → null（不筛选）。 */
export function matchComment(text: string, keywords: string[]): string | null {
  if (keywords.length === 0) return null;
  const hay = text.toLowerCase();
  for (const kw of keywords) {
    const k = kw.trim().toLowerCase();
    if (k && hay.includes(k)) return kw;
  }
  return null;
}
