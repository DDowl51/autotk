import { request } from "../client";
import { sessionPath } from "../session";

/**
 * 获取当前界面的可访问性元素树（XML）。
 * 用于按元素而非硬编码坐标来定位按钮，是机型自适配的核心。
 */
export default function source(): Promise<string> {
  return request<string>(sessionPath("/source"));
}
