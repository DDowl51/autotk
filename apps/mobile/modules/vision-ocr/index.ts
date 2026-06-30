import { requireNativeModule } from "expo-modules-core";

/** 一段识别到的文字 + 归一化(0~1)的位置（左上原点）。 */
export interface TextBox {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
}

const Native = requireNativeModule("VisionOcr");

/**
 * 用 Apple Vision 识别整张图片中的文字，返回每段文字 + 归一化位置。
 * 仅在自定义 dev build（含本原生模块）上可用；Expo Go 不可用。
 */
export function recognize(base64Png: string): Promise<TextBox[]> {
  return Native.recognize(base64Png);
}
