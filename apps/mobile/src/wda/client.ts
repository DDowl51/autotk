// WDA(WebDriverAgent) REST API 底层客户端。
// 协议参考：https://github.com/appium/WebDriverAgent
//
// WDA 在被控 iPhone 上监听 8100 端口。本 App 与 WDA 同机运行，因此走 localhost。

let baseUrl = "http://localhost:8100";
let timeoutMs = 20000;

/** 覆盖 WDA 基址（默认 http://localhost:8100）。 */
export function setBaseUrl(url: string): void {
  baseUrl = url.replace(/\/+$/, "");
}

export function getBaseUrl(): string {
  return baseUrl;
}

/** 设置单次请求超时（毫秒）。超时后抛错，避免干等到 fetch 默认的 5 分钟。 */
export function setTimeout_(ms: number): void {
  timeoutMs = ms;
}

/** WDA 返回的统一信封。 */
export interface WdaResp<T> {
  value: T;
  sessionId: string | null;
}

export class WdaError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "WdaError";
  }
}

/**
 * 向 WDA 发一次请求，返回 value 字段。
 * 非 2xx 或 WDA 返回错误对象时抛 WdaError。
 */
export async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      ...options,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new WdaError(`请求超时(${timeoutMs}ms)`, 0, path);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  let body: WdaResp<T> | undefined;
  try {
    body = (await res.json()) as WdaResp<T>;
  } catch {
    // 某些端点（如 /screenshot 之外的）总返回 JSON；解析失败按状态码处理。
  }

  if (!res.ok) {
    const msg =
      (body?.value as unknown as { message?: string })?.message ??
      `WDA ${res.status}`;
    throw new WdaError(msg, res.status, path);
  }

  // 2xx 但无 JSON 体（少见，如某些空响应）：返回 undefined，避免 body!.value 抛 TypeError。
  return body ? body.value : (undefined as unknown as T);
}
