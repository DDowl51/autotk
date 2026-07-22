// OpenAI 兼容 HTTP 后端(vLLM / OpenAI 风格 /v1/chat/completions 多模态)。
// 远程/本地都能用——只要暴露这个协议。换别家只改 baseUrl/model。
import type { ImageBytes } from "@auto/core";
import type { InferOpts, PerceptorBackend } from "./backend";

export interface OpenAiBackendOpts {
  /** 服务基址,如 http://gpu-server:8000(会拼 /v1/chat/completions)。 */
  baseUrl: string;
  model: string;
  apiKey?: string;
  maxTokens?: number; // 单框输出很短,默认 64
  temperature?: number;
  timeoutMs?: number; // 默认 30s
  imageMime?: string; // 默认 image/png
}

export function createOpenAiBackend(o: OpenAiBackendOpts): PerceptorBackend {
  const base = o.baseUrl.replace(/\/+$/, "");
  const url = `${base}/v1/chat/completions`;
  const timeoutMs = o.timeoutMs ?? 30000;

  return {
    async infer(image: ImageBytes, instruction: string, opts?: InferOpts): Promise<string> {
      const dataUri = `data:${o.imageMime ?? "image/png"};base64,${Buffer.from(image).toString("base64")}`;
      const body = {
        model: o.model,
        max_tokens: opts?.maxTokens ?? o.maxTokens ?? 64,
        temperature: o.temperature ?? 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instruction },
              { type: "image_url", image_url: { url: dataUri } },
            ],
          },
        ],
      };
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(o.apiKey ? { Authorization: `Bearer ${o.apiKey}` } : {}),
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        // 读 body 也在超时保护内(clearTimeout 在 finally):反代先发响应头后上游挂死时,
        // 若在 fetch resolve 就解除定时器,json() 会挂到 undici 默认 bodyTimeout(~300s),击穿 Step.timeout。
        if (!res.ok) throw new Error(`感知服务 ${res.status}: ${await res.text().catch(() => "")}`);
        const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        return json.choices?.[0]?.message?.content ?? "";
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          throw new Error(`感知服务超时(${timeoutMs}ms): ${url}`);
        }
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
