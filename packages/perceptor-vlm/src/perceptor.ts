// Perceptor 实现:后端(发图+指令)× 协议(拼指令+解析)组装成 @auto/core 的 Perceptor。
// region 语义:提示词保持纯 phrase(不确定模型支持区域约束,乱加恐降精度),
// 由客户端**后过滤**兜底——命中框中心落在 region 外即视为误判丢弃(specs「先验区域降误判」)。
import type { Box, Hit, ImageBytes, LocateQuery, Perceptor, TextLine } from "@auto/core";
import type { PerceptorBackend } from "./backend";
import {
  buildFindInstruction,
  buildLocateInstruction,
  buildOcrInstruction,
  locateResponseComplies,
  parseFirstBox,
  parseLocateResponse,
  parseOcrResponse,
} from "./protocol";

export interface VlmPerceptorOpts {
  backend: PerceptorBackend;
  /** OCR 可换独立后端(如 PaddleOCR 服务的 OpenAI 兼容壳);缺省与 grounding 同后端。 */
  ocrBackend?: PerceptorBackend;
  /** grounding 输出上限;缺省按目标数估算(每目标一行 ~24 token)。 */
  locateMaxTokens?: number;
  /** OCR 输出上限;评论区一屏文字多,缺省 1024。 */
  ocrMaxTokens?: number;
}

/** 框中心是否落在 region 内(含边界)。 */
function centerInRegion(box: Box, region: Box): boolean {
  const cx = (box[0] + box[2]) / 2;
  const cy = (box[1] + box[3]) / 2;
  return cx >= region[0] && cx <= region[2] && cy >= region[1] && cy <= region[3];
}

/**
 * region 必须是合法角点框。[x,y,w,h] 格式漏转换(如注册表数据直通)会产生 x2<x1 的
 * 退化框 → 过滤恒 false → 一切命中被静默丢弃,与「模型没找到」不可区分。在此 fail-fast。
 */
function assertRegion(region: Box): void {
  if (!(region[0] < region[2] && region[1] < region[3])) {
    throw new Error(`region 非法(应为归一化角点 [x1,y1,x2,y2],疑似 [x,y,w,h] 未转换): ${JSON.stringify(region)}`);
  }
}

export function createVlmPerceptor(o: VlmPerceptorOpts): Perceptor {
  const ocrBackend = o.ocrBackend ?? o.backend;
  return {
    async locate(img: ImageBytes, queries: LocateQuery[]): Promise<Hit[]> {
      if (queries.length === 0) return [];
      for (const q of queries) if (q.region) assertRegion(q.region);
      const maxTokens = o.locateMaxTokens ?? Math.max(64, 16 + 24 * queries.length);
      const raw = await o.backend.infer(img, buildLocateInstruction(queries), { maxTokens });
      const byId = new Map(queries.map((q) => [q.id, q]));
      const inRegion = (h: Hit): boolean => {
        const region = byId.get(h.id)?.region;
        return !region || centerInRegion(h.box, region);
      };
      if (locateResponseComplies(raw)) return parseLocateResponse(raw, queries).filter(inRegion);
      // ⚠️ P1 退化(2026-07-20 拍板,docs/决策记录-2026-07-20.md):组合指令完全不被服从
      // (响应里没有任何 "<n>: <box>/none" 行)时,只查第一个目标——引擎拼查询 hazards 在前
      // (engine.ts queryIds),故「第一个」=最高优先;本帧放弃其余目标,宁缺勿乱。
      const first = queries[0];
      const raw2 = await o.backend.infer(img, buildFindInstruction(first.phrase), {
        maxTokens: o.locateMaxTokens ?? 64,
      });
      const box = parseFirstBox(raw2);
      return box ? [{ id: first.id, box, score: 1 }].filter(inRegion) : [];
    },
    async readText(img: ImageBytes, region?: Box): Promise<TextLine[]> {
      if (region) assertRegion(region);
      const maxTokens = o.ocrMaxTokens ?? 1024;
      const raw = await ocrBackend.infer(img, buildOcrInstruction(region), { maxTokens });
      const lines = parseOcrResponse(raw);
      return region ? lines.filter((l) => centerInRegion(l.box, region)) : lines;
    },
  };
}
