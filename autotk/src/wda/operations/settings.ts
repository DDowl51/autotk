import { request } from "../client";
import { sessionPath } from "../session";

/** 读取当前会话的 WDA settings。 */
export function getSettings(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(sessionPath("/appium/settings"));
}

/** 更新 WDA settings，返回更新后的完整 settings。 */
export function updateSettings(
  settings: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(sessionPath("/appium/settings"), {
    method: "POST",
    body: JSON.stringify({ settings }),
  });
}
