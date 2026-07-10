// 可换后端:把「发图+指令→收模型原始文本」抽象出来。HTTP(OpenAI 兼容)是其一;
// 以后换本地 LocateAnything 进程、换别家模型,只换这一层,上层 Perceptor 无感。
import type { ImageBytes } from "@auto/core";

/** 单次推理可覆盖的参数(OCR 输出比 grounding 长得多,maxTokens 按调用给)。 */
export interface InferOpts {
  maxTokens?: number;
}

export interface PerceptorBackend {
  /**
   * 发一张图 + 一段文本指令,返回模型的原始文本输出。
   * grounding 与 OCR 走同一方法,只是 instruction 不同;解析在客户端(见 protocol.ts)。
   */
  infer(image: ImageBytes, instruction: string, opts?: InferOpts): Promise<string>;
}
