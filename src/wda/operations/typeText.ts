import { request } from "../client";
import { sessionPath } from "../session";

/**
 * 向当前聚焦的输入框输入文本（需先点击输入框使其聚焦）。
 * 用于搜索关键词、评论回复等。
 */
export default function typeText(text: string): Promise<void> {
  return request<void>(sessionPath("/wda/keys"), {
    method: "POST",
    body: JSON.stringify({ value: [...text] }),
  });
}
