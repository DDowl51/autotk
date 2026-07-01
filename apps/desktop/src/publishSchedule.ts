// 定时发布的错峰时间计算（纯逻辑，便于单测）。每条视频各自一个发送时间，非统一。
import dayjs, { type Dayjs } from "dayjs";
import type { DevicePlan, PublishPlanItem } from "./publish-ipc";

/** 把一组待发视频的发送时间在「现在 → 当天结束」上错峰铺开（每条落各自段中心，最小间隔 30s），保证都在将来。 */
export function spreadTimesFor(pending: PublishPlanItem[], now: number = Date.now()): Record<string, Dayjs> {
  const endOfDay = dayjs(now).endOf("day").valueOf();
  const span = Math.max(0, endOfDay - now);
  const n = pending.length || 1;
  const out: Record<string, Dayjs> = {};
  pending.forEach((it, i) => {
    const base = now + Math.round((span * (i + 0.5)) / n);
    out[it.absPath] = dayjs(Math.max(base, now + (i + 1) * 30_000));
  });
  return out;
}

/** 扫描后初始化每条视频的发送时间：新视频用错峰建议，已手动改过的沿用旧值（键=absPath）。 */
export function initTimes(plans: DevicePlan[], prev: Record<string, Dayjs | null>): Record<string, Dayjs | null> {
  const m: Record<string, Dayjs | null> = {};
  for (const p of plans) {
    const spread = spreadTimesFor(p.pending);
    for (const it of p.pending) m[it.absPath] = it.absPath in prev ? prev[it.absPath] : spread[it.absPath];
  }
  return m;
}
