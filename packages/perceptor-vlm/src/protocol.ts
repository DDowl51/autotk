// grounding + OCR 协议(客户端拼 prompt + 解析 <box>)。与 LocateAnything 输出对齐:
// <box><x1><y1><x2><y2></box>,坐标 0-1000 归一化。此文件是「协议单一真源」——
// 真机若发现模型偏好别的措辞/格式,只改这里。
import type { Box, Hit, LocateQuery, TextLine } from "@auto/core";

/** 组合定位指令:一次问多个目标,按序号返回框或 none(每步一次调用,省 GPU)。 */
export function buildLocateInstruction(queries: LocateQuery[]): string {
  const items = queries.map((q, i) => `${i + 1}. ${q.phrase}`).join("\n");
  return (
    "Locate each region below in the image. For each item, output one line:\n" +
    '"<n>: <box><x1><y1><x2><y2></box>" with integer coordinates in 0-1000, ' +
    'or "<n>: none" if it is not present.\n' +
    items
  );
}

/**
 * 4 个 0-1000 整数 → 归一化 Box。越界(>1000)或退化(x1≥x2 / y1≥y2)= 模型输出畸形,
 * 丢弃返回 null——宁可当「缺席」让引擎轮询重试,绝不拿修补过的坐标去点(D6 不盲动)。
 */
function toBox(x1: string, y1: string, x2: string, y2: string): Box | null {
  const n = [Number(x1), Number(y1), Number(x2), Number(y2)];
  if (n.some((v) => v > 1000)) return null;
  if (n[0] >= n[2] || n[1] >= n[3]) return null;
  return [n[0] / 1000, n[1] / 1000, n[2] / 1000, n[3] / 1000];
}

// 冒号前后只容 [ \t](不吃换行):防叙述句「…items 1 and 2:」+ 下一行裸框被误绑成序号 2。
const LINE_RE = /(\d+)[ \t]*:[ \t]*<box><(\d+)><(\d+)><(\d+)><(\d+)><\/box>/g;

/** 解析组合定位响应 → Hit[]。按序号映射回 query.id;none/缺行/畸形框不返回(=缺席)。坐标 /1000 归一化。 */
export function parseLocateResponse(text: string, queries: LocateQuery[]): Hit[] {
  const out: Hit[] = [];
  const seen = new Set<number>();
  for (const m of text.matchAll(LINE_RE)) {
    const n = parseInt(m[1], 10);
    const q = queries[n - 1];
    if (!q || seen.has(n)) continue;
    const box = toBox(m[2], m[3], m[4], m[5]);
    if (!box) continue; // 畸形框不占序号:后面若有同序号的合法行仍可用
    seen.add(n);
    out.push({ id: q.id, box, score: 1 });
  }
  return out;
}

/** 单目标定位指令。备用工具:生产的 ctx.find 走组合协议(buildLocateInstruction);此为调试/特殊场景。 */
export function buildFindInstruction(phrase: string): string {
  return `Locate the region that matches: ${phrase}. Output "<box><x1><y1><x2><y2></box>" with coordinates 0-1000, or "none".`;
}

const BOX_RE = /<box><(\d+)><(\d+)><(\d+)><(\d+)><\/box>/g;

/** 解析响应中第一个**合法**框 → Box 或 null(畸形框跳过)。 */
export function parseFirstBox(text: string): Box | null {
  for (const m of text.matchAll(BOX_RE)) {
    const box = toBox(m[1], m[2], m[3], m[4]);
    if (box) return box;
  }
  return null;
}

/** 把归一化 Box([0,1])转成 0-1000 整数的 <box> 文本(拼 region 提示用)。 */
function boxTag(b: Box): string {
  const c = (v: number) => Math.max(0, Math.min(1000, Math.round(v * 1000)));
  return `<box><${c(b[0])}><${c(b[1])}><${c(b[2])}><${c(b[3])}></box>`;
}

/** OCR 读文本指令:逐行输出「<box>…</box> 文字」;region 给了就限定只读区域内。 */
export function buildOcrInstruction(region?: Box): string {
  const scope = region
    ? `Only read text inside the region ${boxTag(region)} (coordinates 0-1000). `
    : "";
  return (
    "Read all visible text in the image, line by line, top to bottom. " +
    scope +
    "For each text line output exactly one line:\n" +
    '"<box><x1><y1><x2><y2></box> <text>" — the bounding box in integer coordinates 0-1000, ' +
    "then a space, then the text content verbatim. Output nothing else."
  );
}

// 文本 = 框后到「下一个 <box> 或行尾」为止:模型把多条结果挤同一行时按框切分,标签不混入文本。
const OCR_RE = /<box><(\d+)><(\d+)><(\d+)><(\d+)><\/box>[ \t]*((?:(?!<box>)[^\n\r])*)/g;

/** 解析 OCR 响应 → TextLine[]。无框/空文本/畸形框忽略;坐标 /1000 归一化;文本 trim。 */
export function parseOcrResponse(text: string): TextLine[] {
  const out: TextLine[] = [];
  for (const m of text.matchAll(OCR_RE)) {
    const box = toBox(m[1], m[2], m[3], m[4]);
    const t = m[5].trim();
    if (!box || !t) continue;
    out.push({ text: t, box });
  }
  return out;
}
