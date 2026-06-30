import { request } from "../client";
import { sessionPath } from "../session";

// iOS 系统弹窗（权限/系统 alert）处理。比 OCR 可靠：直接读 alert 文字/按钮并点。
// 端点：W3C/WDA 的 /alert/text、/wda/alert/buttons、/alert/accept（可带 {name} 点指定按钮）、/alert/dismiss。

/** 当前是否有系统弹窗：有则返回其文字，无则返回 null（WDA 无 alert 会报错）。 */
export async function alertText(): Promise<string | null> {
  try {
    return await request<string>(sessionPath("/alert/text"));
  } catch {
    return null;
  }
}

/** 系统弹窗的按钮文字列表（无弹窗返回空数组）。 */
export async function alertButtons(): Promise<string[]> {
  try {
    return await request<string[]>(sessionPath("/wda/alert/buttons"));
  } catch {
    return [];
  }
}

/** 点系统弹窗里文字为 name 的按钮。 */
export function alertClickButton(name: string): Promise<void> {
  return request<void>(sessionPath("/alert/accept"), {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

/** 默认 dismiss（通常等于点取消/拒绝那一项）。 */
export function alertDismiss(): Promise<void> {
  return request<void>(sessionPath("/alert/dismiss"), { method: "POST" });
}

/** 默认 accept。 */
export function alertAccept(): Promise<void> {
  return request<void>(sessionPath("/alert/accept"), { method: "POST" });
}
