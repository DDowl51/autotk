// 从注册表 JSON 加载 Target[] + 激活规则。本 JSON 是插件的数据源(docs/specs/target-registry.json 是设计快照)。
import type { Activation } from "@auto/core";
import type { Box, HazardClass, Target } from "@auto/core";
import raw from "./target-registry.json";

interface RawTarget {
  id: string;
  phrase: string;
  kind: string;
  hazardClass?: string;
  handler?: string;
  ocr?: string;
  region?: number[];
  box?: number[];
  stable?: boolean;
}

/**
 * 注册表 region 是归一化 [x,y,w,h](见 docs/specs/target-registry-说明.md);
 * core 的 Box 是角点 [x1,y1,x2,y2](geometry.ts)。加载时在此换算+校验——
 * 坏数据 fail-fast 抛错,绝不让 [x,y,w,h] 原样流进 perceptor 的 region 过滤(会静默丢掉一切命中)。
 */
function regionToBox(id: string, r: number[]): Box {
  const [x, y, w, h] = r;
  if (!(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1 + 1e-9 && y + h <= 1 + 1e-9)) {
    throw new Error(`Target ${id} region 非法(应为归一化 [x,y,w,h]): ${JSON.stringify(r)}`);
  }
  return [x, y, Math.min(1, x + w), Math.min(1, y + h)];
}

function toTarget(t: RawTarget): Target {
  return {
    id: t.id,
    phrase: t.phrase,
    kind: t.kind === "hazard" ? "hazard" : "expected",
    hazardClass: t.hazardClass as HazardClass | undefined,
    handler: t.handler as Target["handler"],
    ocr: t.ocr,
    region: t.region && t.region.length === 4 ? regionToBox(t.id, t.region) : undefined,
    box: t.box,
    stable: t.stable,
  };
}

export const targets: Target[] = (raw.targets as RawTarget[]).map(toTarget);
export const activation: Activation = raw.activation as Activation;

/** 便捷:某页每步要查的危险 = global ∪ page。 */
export function pageHazards(page: string): string[] {
  return [...activation.globalHazards, ...(activation.pageHazards[page] ?? [])];
}
