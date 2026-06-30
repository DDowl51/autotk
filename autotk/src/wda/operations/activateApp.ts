import { request } from "../client";
import { sessionPath } from "../session";

/**
 * 把指定 app 切到前台（不重启，保留当前界面）。
 * WDA 的所有点击/滑动/读取都作用于前台 app，因此操控 TikTok 前必须先激活它。
 */
export function activateApp(bundleId: string): Promise<void> {
  return request<void>(sessionPath("/wda/apps/activate"), {
    method: "POST",
    body: JSON.stringify({ bundleId }),
  });
}
