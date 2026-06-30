import { request } from "../client";

/** 回到 iOS 主屏幕（无需 session）。 */
export default function go_home(): Promise<void> {
  return request<void>("/wda/homescreen", { method: "POST" });
}
