import type { OcrBox } from "../vision/caption";
import { DISMISS_TEXT, inActionRail, type PopupHit } from "./popupDetect";

// 把 PopupHit 的关闭计划转成具体操作步骤（纯逻辑，坐标=像素）。执行交给 onDeviceUI。

export interface Pt {
  x: number;
  y: number;
}
export type DismissStep =
  | { kind: "tap"; point: Pt }
  | { kind: "swipe"; from: Pt; to: Pt }
  | { kind: "back" };

export interface Size {
  width: number;
  height: number;
}

/** 找到关闭按钮文字框（整串匹配、非右栏），返回其像素中心。 */
export function findDismissText(boxes: OcrBox[], size: Size): Pt | null {
  const b = boxes.find((x) => !inActionRail(x) && DISMISS_TEXT.test(x.text.trim()));
  if (!b) return null;
  return { x: (b.x + b.w / 2) * size.width, y: (b.y + b.h / 2) * size.height };
}

export function planDismiss(hit: PopupHit, boxes: OcrBox[], size: Size): DismissStep[] {
  const steps: DismissStep[] = [];
  for (const kind of hit.dismiss) {
    if (kind === "closeText") {
      const p = findDismissText(boxes, size);
      if (p) steps.push({ kind: "tap", point: p });
    } else if (kind === "closeIcon") {
      // 右上角 ✕（归一化坐标待真机核实）。
      steps.push({ kind: "tap", point: { x: size.width * 0.92, y: size.height * 0.1 } });
    } else if (kind === "swipeDown") {
      // 底部单：从中部往下滑关掉。
      steps.push({
        kind: "swipe",
        from: { x: size.width * 0.5, y: size.height * 0.55 },
        to: { x: size.width * 0.5, y: size.height * 0.95 },
      });
    } else if (kind === "tapOutside") {
      // 点卡片外部暗区（顶部安全点）。
      steps.push({ kind: "tap", point: { x: size.width * 0.5, y: size.height * 0.06 } });
    } else if (kind === "back") {
      steps.push({ kind: "back" });
    }
  }
  return steps;
}
