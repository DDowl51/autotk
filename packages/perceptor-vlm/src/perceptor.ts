// Perceptor 实现:后端(发图+指令)× 协议(拼指令+解析)组装成 @auto/core 的 Perceptor。
// region 语义:提示词保持纯 phrase(不确定模型支持区域约束,乱加恐降精度),
// 由客户端**后过滤**兜底——命中框中心落在 region 外即视为误判丢弃(specs「先验区域降误判」)。
import type { Box, Hit, ImageBytes, LocateQuery, Perceptor, TextLine } from "@auto/core";
import type { PerceptorBackend } from "./backend";
import { buildFindInstruction, buildOcrInstruction, parseFirstBox, parseOcrResponse } from "./protocol";

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
      // LocateAnything-3B 是**单目标** grounding 模型:一句 phrase → 一个框。组合查询(编号列多目标)
      // 即使格式服从也只返回第一个目标——真机实测 2026-07-21(2/3/4/5/6 目标同查均只回 1 个),
      // 与模型架构一致(PBD 框头 + 自定义 hybrid generate,原生任务即单指代表达)。
      // 故**逐个单查**(同一帧图,各命中框中心须落在其 region 内)。N 目标 = N 次推理,是该模型固有成本,
      // 引擎正常一步只单查 1 个;各步 hazards/expected 只列必要项以控每 poll 调用数。
      const maxTokens = o.locateMaxTokens ?? 64;
      const hits: Hit[] = [];
      for (const q of queries) {
        const raw = await o.backend.infer(img, buildFindInstruction(q.phrase), { maxTokens });
        const box = parseFirstBox(raw);
        if (box && (!q.region || centerInRegion(box, q.region))) hits.push({ id: q.id, box, score: 1 });
      }
      return hits;
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
