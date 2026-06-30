import { request } from "../client";
import { sessionPath } from "../session";
import type { Point } from "../types";

/**
 * 通过 /wda/touch/perform（MJSONWP 触摸动作）在坐标处单击。
 * 与 W3C /actions 是不同的代码路径，某些 WDA 版本上更快/更可靠。
 */
export function touchTap(p: Point): Promise<void> {
  return request<void>(sessionPath("/wda/touch/perform"), {
    method: "POST",
    body: JSON.stringify({
      actions: [
        { action: "tap", options: { x: Math.round(p.x), y: Math.round(p.y) } },
      ],
    }),
  });
}

/** 通过 /wda/touch/perform 实现滑动（press → wait → moveTo → release）。 */
export function touchSwipe(from: Point, to: Point, durationMs = 250): Promise<void> {
  return request<void>(sessionPath("/wda/touch/perform"), {
    method: "POST",
    body: JSON.stringify({
      actions: [
        { action: "press", options: { x: Math.round(from.x), y: Math.round(from.y) } },
        { action: "wait", options: { ms: durationMs } },
        { action: "moveTo", options: { x: Math.round(to.x), y: Math.round(to.y) } },
        { action: "release", options: {} },
      ],
    }),
  });
}
