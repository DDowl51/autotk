import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenAiBackend } from "../src/openai-backend";

// —— mock 全局 fetch:队列化响应,记录每次调用(风格对齐 driver-ios-wda)——
interface MockResp {
  status?: number;
  content?: string;
  reject?: Error;
}
let queue: MockResp[] = [];
let calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];

beforeEach(() => {
  queue = [];
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: { headers?: Record<string, string>; body?: string }) => {
      calls.push({ url: String(url), headers: init?.headers ?? {}, body: init?.body ? JSON.parse(init.body) : {} });
      const r = queue.shift() ?? { content: "" };
      if (r.reject) throw r.reject;
      const status = r.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => "err-body",
        json: async () => ({ choices: [{ message: { content: r.content ?? "" } }] }),
      } as unknown as Response;
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const IMG = new Uint8Array([137, 80]);

describe("OpenAI 兼容后端", () => {
  it("拼 /v1/chat/completions;body 含 model/指令/dataUri 图像;返回 content", async () => {
    queue.push({ content: "1: none" });
    const b = createOpenAiBackend({ baseUrl: "http://gpu:8000/", model: "locate-anything-3b" });
    const out = await b.infer(IMG, "find stuff");
    expect(out).toBe("1: none");
    expect(calls[0].url).toBe("http://gpu:8000/v1/chat/completions");
    expect(calls[0].body.model).toBe("locate-anything-3b");
    const content = (calls[0].body.messages as { content: { type: string; text?: string; image_url?: { url: string } }[] }[])[0].content;
    expect(content[0]).toEqual({ type: "text", text: "find stuff" });
    expect(content[1].image_url!.url).toBe(`data:image/png;base64,${Buffer.from(IMG).toString("base64")}`);
  });

  it("max_tokens:调用级 > 构造级 > 默认 64;temperature 默认 0", async () => {
    queue.push({}, {}, {});
    const b = createOpenAiBackend({ baseUrl: "http://gpu:8000", model: "m" });
    await b.infer(IMG, "i");
    expect(calls[0].body.max_tokens).toBe(64);
    expect(calls[0].body.temperature).toBe(0);
    const b2 = createOpenAiBackend({ baseUrl: "http://gpu:8000", model: "m", maxTokens: 128 });
    await b2.infer(IMG, "i");
    expect(calls[1].body.max_tokens).toBe(128);
    await b2.infer(IMG, "i", { maxTokens: 1024 });
    expect(calls[2].body.max_tokens).toBe(1024);
  });

  it("apiKey → Authorization Bearer 头;不给则无该头", async () => {
    queue.push({}, {});
    await createOpenAiBackend({ baseUrl: "http://g", model: "m", apiKey: "sk-1" }).infer(IMG, "i");
    expect(calls[0].headers.Authorization).toBe("Bearer sk-1");
    await createOpenAiBackend({ baseUrl: "http://g", model: "m" }).infer(IMG, "i");
    expect(calls[1].headers.Authorization).toBeUndefined();
  });

  it("非 2xx → 抛错带状态码与响应体", async () => {
    queue.push({ status: 503 });
    const b = createOpenAiBackend({ baseUrl: "http://g", model: "m" });
    await expect(b.infer(IMG, "i")).rejects.toThrow(/503.*err-body/);
  });

  it("AbortError(超时)→ 包装成带 timeoutMs 与 URL 的可读错误", async () => {
    queue.push({ reject: Object.assign(new Error("This operation was aborted"), { name: "AbortError" }) });
    const b = createOpenAiBackend({ baseUrl: "http://gpu:8000", model: "m", timeoutMs: 5000 });
    await expect(b.infer(IMG, "i")).rejects.toThrow(/感知服务超时\(5000ms\).*gpu:8000/);
  });

  it("空 choices → 返回空串(不炸)", async () => {
    queue.push({ content: undefined });
    vi.mocked(fetch).mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response);
    const b = createOpenAiBackend({ baseUrl: "http://g", model: "m" });
    expect(await b.infer(IMG, "i")).toBe("");
  });
});
