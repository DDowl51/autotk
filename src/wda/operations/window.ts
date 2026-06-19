import { request } from "../client";
import { sessionPath } from "../session";

/** 当前窗口(屏幕)逻辑尺寸。 */
export function windowSize(): Promise<{ width: number; height: number }> {
  return request<{ width: number; height: number }>(sessionPath("/window/size"));
}
