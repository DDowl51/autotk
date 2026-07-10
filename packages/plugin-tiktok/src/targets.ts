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

function toTarget(t: RawTarget): Target {
  return {
    id: t.id,
    phrase: t.phrase,
    kind: t.kind === "hazard" ? "hazard" : "expected",
    hazardClass: t.hazardClass as HazardClass | undefined,
    handler: t.handler as Target["handler"],
    ocr: t.ocr,
    region: t.region && t.region.length === 4 ? (t.region as unknown as Box) : undefined,
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
