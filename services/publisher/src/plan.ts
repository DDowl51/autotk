import { filterUnpublished } from "./dedup";
import { parseCaptionsFile, resolveCaption } from "./captions";
import { spread, toWindows, secsToTimestamps, startOfDayMs } from "./scheduler";
import type { VideoItem, Manifest, PublishPlanItem } from "./types";

// 把「扫描结果 + 已发清单 + 文案来源 + 时段」算成某设备的待发计划（去重→文案→排程）。纯函数。

export interface ScheduleInput {
  allDay: boolean;
  taskWindows: Array<{ start: string; end: string }>;
  dayStartMs?: number;
  jitterSec?: number;
  rng?: () => number;
}

export interface PlanInput {
  items: VideoItem[];
  manifest: Manifest;
  captionsText?: string; // captions.txt 内容
  sameNameTxts?: Record<string, string>; // fileName → 同名 txt 内容
  schedule: ScheduleInput;
}

export function planDevice(input: PlanInput): PublishPlanItem[] {
  const pending = filterUnpublished(input.items, input.manifest);
  const captionsMap = input.captionsText ? parseCaptionsFile(input.captionsText) : undefined;
  const windows = toWindows(input.schedule.allDay, input.schedule.taskWindows);
  const dayStart = input.schedule.dayStartMs ?? startOfDayMs();
  const secs = spread(pending.length, windows, {
    jitterSec: input.schedule.jitterSec,
    rng: input.schedule.rng,
  });
  const times = secsToTimestamps(secs, dayStart);
  return pending.map((it, i) => ({
    ...it,
    caption: resolveCaption(it.fileName, {
      sameNameTxt: input.sameNameTxts?.[it.fileName],
      captionsMap,
    }),
    // 排程返回的是升序时刻，按文件顺序对应；窗口为空时退化为当天 0 点。
    scheduledAt: times[i] ?? dayStart,
  }));
}
