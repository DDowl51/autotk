// WDA(WebDriverAgent)REST 客户端 —— 每台手机一个实例(自带 baseUrl + sessionId)。
// 严格按 docs/specs/L0-WDA-规格书.md。会话/自愈/20s 超时全封在这里。
import type { Point, Size } from "@auto/core";

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

interface WdaResp<T> {
  value: T;
  sessionId: string | null;
}

const TIKTOK_BUNDLE_ID = "com.zhiliaoapp.musically";

/** 建会话后立即下发的提速设置(snapshotMaxDepth:1 等,性命攸关,见规格 §4)。 */
const FAST_SETTINGS = {
  waitForIdleTimeout: 0,
  animationCoolOffTimeout: 0,
  shouldWaitForQuiescence: false,
  shouldUseCompactResponses: true,
  snapshotMaxDepth: 1,
};

export class WdaClient {
  private sessionId: string | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 20000,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        ...init,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new WdaError(`请求超时(${this.timeoutMs}ms)`, 0, path);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
    let body: WdaResp<T> | undefined;
    try {
      body = (await res.json()) as WdaResp<T>;
    } catch {
      /* 空响应体按状态码处理 */
    }
    if (!res.ok) {
      const msg = (body?.value as unknown as { message?: string })?.message ?? `WDA ${res.status}`;
      throw new WdaError(msg, res.status, path);
    }
    return body ? body.value : (undefined as unknown as T);
  }

  private sessionPath(suffix: string): string {
    if (!this.sessionId) throw new WdaError("WDA session 未建立", 0, suffix);
    return `/session/${this.sessionId}${suffix}`;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  /** 建空会话(不传 bundleId,快)+ 立即 applyFastSettings。 */
  async createSession(): Promise<void> {
    const value = await this.request<{ sessionId: string }>("/session", {
      method: "POST",
      body: JSON.stringify({ capabilities: { alwaysMatch: { "appium:shouldWaitForQuiescence": false } } }),
    });
    this.sessionId = value.sessionId;
    await this.request(this.sessionPath("/appium/settings"), {
      method: "POST",
      body: JSON.stringify({ settings: FAST_SETTINGS }),
    });
  }

  /** 仅清本地 sessionId(不发网络)。WDA 重启后旧 session 失效时用,下次 ensureHealthy 重建。 */
  resetSession(): void {
    this.sessionId = null;
  }

  /** 会话失效自愈:无 session 或探测失败 → 重建。 */
  async ensureHealthy(): Promise<void> {
    if (!this.sessionId) {
      await this.createSession();
      return;
    }
    try {
      await this.request(this.sessionPath("/window/size")); // 轻量探测
    } catch (e) {
      if (e instanceof WdaError && (e.status === 404 || e.status === 0)) {
        this.resetSession();
        await this.createSession();
      } else {
        throw e;
      }
    }
  }

  async windowSize(): Promise<Size> {
    return this.request<Size>(this.sessionPath("/window/size"));
  }

  async activateApp(bundleId: string = TIKTOK_BUNDLE_ID): Promise<void> {
    await this.request(this.sessionPath("/wda/apps/activate"), {
      method: "POST",
      body: JSON.stringify({ bundleId }),
    });
  }

  async screenshot(): Promise<Uint8Array> {
    const b64 = await this.request<string>(this.sessionPath("/screenshot"));
    return Buffer.from(b64, "base64"); // Buffer 是 Uint8Array 子类
  }

  async tap(p: Point): Promise<void> {
    await this.request(this.sessionPath("/actions"), {
      method: "POST",
      body: JSON.stringify({
        actions: [
          {
            type: "pointer",
            id: "finger1",
            parameters: { pointerType: "touch" },
            actions: [
              { type: "pointerMove", duration: 0, x: Math.round(p.x), y: Math.round(p.y) },
              { type: "pointerDown", button: 0 },
              { type: "pause", duration: 60 },
              { type: "pointerUp", button: 0 },
            ],
          },
        ],
      }),
    });
  }

  async swipe(from: Point, to: Point, durMs: number): Promise<void> {
    await this.request(this.sessionPath("/actions"), {
      method: "POST",
      body: JSON.stringify({
        actions: [
          {
            type: "pointer",
            id: "finger1",
            parameters: { pointerType: "touch" },
            actions: [
              { type: "pointerMove", duration: 0, x: Math.round(from.x), y: Math.round(from.y) },
              { type: "pointerDown", button: 0 },
              { type: "pointerMove", duration: Math.round(durMs), x: Math.round(to.x), y: Math.round(to.y) },
              { type: "pointerUp", button: 0 },
            ],
          },
        ],
      }),
    });
  }

  async typeText(s: string): Promise<void> {
    await this.request(this.sessionPath("/wda/keys"), {
      method: "POST",
      body: JSON.stringify({ value: [...s] }),
    });
  }
}
