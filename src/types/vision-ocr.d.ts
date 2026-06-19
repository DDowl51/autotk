// 本地原生模块 vision-ocr 的类型声明（实际实现在 modules/vision-ocr）。
// 让 app 侧 tsc 认得这个模块；运行时由 dev build 的 autolinking 提供。
declare module "vision-ocr" {
  export interface TextBox {
    text: string;
    x: number;
    y: number;
    w: number;
    h: number;
    confidence: number;
  }
  export function recognize(base64Png: string): Promise<TextBox[]>;
}
