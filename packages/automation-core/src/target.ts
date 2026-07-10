// 声明式感知目标(插件提供数据;core 只按 id/phrase/handler 消费)。见 docs/specs/target-registry.json。
import type { Box } from "./geometry";

/** 危险分类,决定处理优先级(system > overlay > category)与 handler 语义。 */
export type HazardClass = "system" | "overlay" | "category";

/**
 * handler:
 * - deny/allow/tapBox 执行上都是「点定位到的框」(deny/allow 是审计语义标签);
 * - swipeAway 盲滑走(直播卡);back iOS 返回手势;skip 不处理(交插件动作层,如广告评论)。
 */
export type HazardHandler = "deny" | "allow" | "tapBox" | "swipeAway" | "skip" | "back";

export interface Target {
  id: string;
  /** 送 grounding 的英文定位短语。 */
  phrase: string;
  kind: "hazard" | "expected";
  hazardClass?: HazardClass;
  handler?: HazardHandler;
  /** OCR 二次确认/系统窗按钮匹配用的正则源(加载时 new RegExp(pattern,'i'))。 */
  ocr?: string;
  /** 归一化先验区域,缩小搜索、降误判。 */
  region?: Box;
  /** 已实测的固定位置(VLM 失败兜底)。 */
  box?: readonly number[];
  /** 位置极稳,未来可提为「盲点」优化。 */
  stable?: boolean;
}

/** 目标注册表(id → Target)。core 用 Map 查。 */
export type TargetRegistry = Map<string, Target>;

export function toRegistry(targets: Target[]): TargetRegistry {
  const m = new Map<string, Target>();
  for (const t of targets) {
    if (m.has(t.id)) throw new Error(`Target id 重复: ${t.id}`);
    m.set(t.id, t);
  }
  return m;
}
