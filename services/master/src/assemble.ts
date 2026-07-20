// 由「规整配置 + 探活结果 + driver 取用」产出 Fleet 的每台 PhoneConfig(纯逻辑,可测)。
// - 不可达的跳过(探活已给原因);探不到尺寸又没配的也跳过(无法把归一化框换算像素,不能盲点)。
// - size 优先用配置显式值,否则用探活查到的。
// - 错峰 phaseOffsetMs = 可达序号 × staggerMs(跳过的不占号,偏移保持连续)。
import type { Driver, PhoneConfig } from "@auto/core";
import type { ResolvedConfig } from "./config";
import type { ProbeOutcome } from "./probe";

export function buildPhoneConfigs(
  config: ResolvedConfig,
  outcomes: ProbeOutcome[],
  getDriver: (id: string) => Driver,
): { configs: PhoneConfig[]; skipped: { id: string; reason: string }[] } {
  const byId = new Map(outcomes.map((o) => [o.id, o]));
  const configs: PhoneConfig[] = [];
  const skipped: { id: string; reason: string }[] = [];
  let reachableIdx = 0;

  for (const d of config.devices) {
    const o = byId.get(d.id);
    if (!o || !o.ok) {
      skipped.push({ id: d.id, reason: o ? "不可达" : "无探活结果" });
      continue;
    }
    const size = d.size ?? o.size;
    if (!size) {
      skipped.push({ id: d.id, reason: "未配 size 且探活未返回分辨率" });
      continue;
    }
    configs.push({
      id: d.id,
      driver: getDriver(d.id),
      size,
      params: d.params,
      schedule: d.schedule,
      phaseOffsetMs: reachableIdx * config.staggerMs,
    });
    reachableIdx++;
  }
  return { configs, skipped };
}
