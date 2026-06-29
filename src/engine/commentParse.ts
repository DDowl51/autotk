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
