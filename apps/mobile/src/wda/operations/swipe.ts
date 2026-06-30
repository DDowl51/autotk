import { request } from "../client";
import { sessionPath } from "../session";
import type { Point } from "../types";

/**
 * 从 from 拖拽/滑动到 to，持续 duration 秒。
 * 用 W3C Actions 端点（新版 WDA 已移除旧的 dragfromtoforduration）。
 */
export default function swipe(
  from: Point,
  to: Point,
  duration = 0.3,
): Promise<void> {
  const ms = Math.round(duration * 1000);
  return request<void>(sessionPath("/actions"), {
    method: "POST",
    body: JSON.stringify({
      actions: [
        {
          type: "pointer",
          id: "finger1",
          parameters: { pointerType: "touch" },
          actions: [
            { type: "pointerMove", duration: 0, x: Math.round(from.x), y: Math.round(from.y) },
            { type: "pointerDown", button: 0 },
            { type: "pointerMove", duration: ms, x: Math.round(to.x), y: Math.round(to.y) },
            { type: "pointerUp", button: 0 },
          ],
        },
      ],
    }),
  });
}
