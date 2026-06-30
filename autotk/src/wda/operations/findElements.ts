import { request } from "../client";
import { sessionPath } from "../session";

/**
 * WDA 支持的元素定位策略。
 * - "accessibility id"：accessibility identifier / label
 * - "class name"：如 XCUIElementTypeButton
 * - "predicate string"：NSPredicate，如 label == "Like"
 * - "class chain"：iOS class chain 语法，按类型与属性逐层定位
 * - "link text" / "partial link text" / "name" / "xpath"
 */
export type Using =
  | "accessibility id"
  | "class name"
  | "predicate string"
  | "class chain"
  | "link text"
  | "partial link text"
  | "name"
  | "xpath";

interface ElementRef {
  ELEMENT?: string;
  "element-6066-11e4-a52e-4f735466cecf"?: string;
}

/** 从 WDA 返回的元素引用里取出元素 id。 */
export function elementId(e: ElementRef): string {
  return e.ELEMENT ?? e["element-6066-11e4-a52e-4f735466cecf"] ?? "";
}

/** 查找匹配的所有元素，返回元素 id 列表。 */
export async function findElements(
  using: Using,
  value: string,
): Promise<string[]> {
  const res = await request<ElementRef[]>(sessionPath("/elements"), {
    method: "POST",
    body: JSON.stringify({ using, value }),
  });
  return res.map(elementId).filter(Boolean);
}

/** 查找第一个匹配的元素，没有则返回 null（不抛错）。 */
export async function findFirst(
  using: Using,
  value: string,
): Promise<string | null> {
  const ids = await findElements(using, value);
  return ids[0] ?? null;
}
