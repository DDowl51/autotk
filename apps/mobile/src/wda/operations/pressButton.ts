import { request } from "../client";

export type HardwareButton = "home" | "volumeUp" | "volumeDown";

/**
 * 按下硬件按键（无需 session）。
 * 音量键组合可用于「安全退出自动化」的人工指令识别。
 */
export default function pressButton(name: HardwareButton): Promise<void> {
  return request<void>("/wda/pressButton", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}
