// @auto/perceptor-vlm — Perceptor 的 VLM 实现(LocateAnything 定位 + 同后端 OCR)。
// 组装:createVlmPerceptor({ backend: createOpenAiBackend({...}) })。
// 见 docs/自动化框架-架构设计总纲.md §9。
export * from "./backend";
export * from "./openai-backend";
export * from "./protocol";
export * from "./perceptor";
