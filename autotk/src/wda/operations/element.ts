import { request } from "../client";
import { sessionPath } from "../session";
import type { Point } from "../types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 点击指定元素。 */
export function tapElement(elementId: string): Promise<void> {
  return request<void>(sessionPath(`/element/${elementId}/click`), {
    method: "POST",
    body: "{}",
  });
}

/** 读取元素文本。 */
export function elementText(elementId: string): Promise<string> {
  return request<string>(sessionPath(`/element/${elementId}/text`));
}

/** 读取元素的指定属性（如 "label"、"value"、"name"、"visible"）。 */
export function elementAttribute(
  elementId: string,
  name: string,
): Promise<string | null> {
  return request<string | null>(
    sessionPath(`/element/${elementId}/attribute/${name}`),
  );
}

/** 读取元素的位置与尺寸。 */
export function elementRect(elementId: string): Promise<Rect> {
  return request<Rect>(sessionPath(`/element/${elementId}/rect`));
}

/** 元素中心点坐标，便于按坐标点击/滑动。 */
export async function elementCenter(elementId: string): Promise<Point> {
  const r = await elementRect(elementId);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** 向元素输入文本（元素需可接受输入）。 */
export function setElementValue(
  elementId: string,
  text: string,
): Promise<void> {
  return request<void>(sessionPath(`/element/${elementId}/value`), {
    method: "POST",
    body: JSON.stringify({ value: [...text] }),
  });
}
