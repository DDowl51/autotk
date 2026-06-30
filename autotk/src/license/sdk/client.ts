// Vendored from license-saas/packages/sdk/src/client.ts —— 保持同步（导入去 .js 以兼容 Metro）。
import { signRequest, makeNonce } from "./signing";
import { LicenseError, mapReason } from "./errors";
import { MemoryStorage, type LicenseStorage } from "./storage";

export interface LicenseClientOptions {
  baseUrl: string;
  productKey: string;
  productSecret: string;
  deviceId: string;
  storage?: LicenseStorage;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  now?: () => number;
  storageKey?: string;
  backoffMs?: (attempt: number) => number;
}

export interface StoredLicense {
  token: string;
  expiresAt: number;
  deviceId: string;
  code: string;
}

export interface ActivateResult {
  token: string;
  expiresAt: number;
  reused: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class LicenseClient {
  private readonly baseUrl: string;
  private readonly productKey: string;
  private readonly productSecret: string;
  private readonly deviceId: string;
  private readonly storage: LicenseStorage;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly now: () => number;
  private readonly storageKey: string;
  private readonly backoffFn: (attempt: number) => number;

  constructor(opts: LicenseClientOptions) {
    if (!opts.baseUrl) throw new LicenseError("bad_request", "baseUrl required");
    if (!opts.productKey) throw new LicenseError("bad_request", "productKey required");
    if (!opts.productSecret) throw new LicenseError("bad_request", "productSecret required");
    if (!opts.deviceId) throw new LicenseError("bad_request", "deviceId required");

    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.productKey = opts.productKey;
    this.productSecret = opts.productSecret;
    this.deviceId = opts.deviceId;
    this.storage = opts.storage ?? new MemoryStorage();
    const f = opts.fetchImpl ?? (globalThis.fetch as typeof fetch | undefined);
    if (!f) throw new LicenseError("bad_request", "no fetch available; pass fetchImpl");
    this.fetchImpl = f;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.now = opts.now ?? Date.now;
    this.storageKey = opts.storageKey ?? `license:${opts.productKey}`;
    this.backoffFn =
      opts.backoffMs ?? ((attempt) => Math.min(1000 * 2 ** (attempt - 1), 8000) + Math.floor(Math.random() * 250));
  }

  async activate(code: string, opts: { deviceName?: string } = {}): Promise<ActivateResult> {
    const trimmed = (code ?? "").trim();
    if (!trimmed) throw new LicenseError("bad_request", "empty code");
    const data = await this.signedRequest("/v1/activate", {
      code: trimmed,
      deviceId: this.deviceId,
      ...(opts.deviceName ? { deviceName: opts.deviceName } : {}),
    });
    const info: StoredLicense = {
      token: String(data.token),
      expiresAt: Number(data.expiresAt),
      deviceId: this.deviceId,
      code: trimmed,
    };
    await this.persist(info);
    return { token: info.token, expiresAt: info.expiresAt, reused: !!data.reused };
  }

  async heartbeat(): Promise<{ token: string; expiresAt: number }> {
    try {
      const data = await this.signedRequest("/v1/heartbeat", { deviceId: this.deviceId });
      const prev = await this.getStored();
      const info: StoredLicense = {
        token: String(data.token),
        expiresAt: Number(data.expiresAt),
        deviceId: this.deviceId,
        code: prev?.code ?? "",
      };
      await this.persist(info);
      return { token: info.token, expiresAt: info.expiresAt };
    } catch (e) {
      if (e instanceof LicenseError && (e.code === "revoked" || e.code === "not_activated")) {
        await this.clear();
      }
      throw e;
    }
  }

  async getStored(): Promise<StoredLicense | null> {
    const raw = await this.storage.get(this.storageKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredLicense;
      if (!parsed || typeof parsed.token !== "string" || typeof parsed.expiresAt !== "number") {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async getToken(): Promise<string | null> {
    const s = await this.getStored();
    if (!s) return null;
    return s.expiresAt > this.now() ? s.token : null;
  }

  async isActivated(): Promise<boolean> {
    return (await this.getToken()) !== null;
  }

  async clear(): Promise<void> {
    await this.storage.del(this.storageKey);
  }

  private async persist(info: StoredLicense): Promise<void> {
    await this.storage.set(this.storageKey, JSON.stringify(info));
  }

  private headers(body: string): Record<string, string> {
    const timestamp = this.now();
    const nonce = makeNonce();
    const signature = signRequest(this.productSecret, {
      productKey: this.productKey,
      timestamp,
      nonce,
      body,
    });
    return {
      "content-type": "application/json",
      "x-product-key": this.productKey,
      "x-timestamp": String(timestamp),
      "x-nonce": nonce,
      "x-signature": signature,
    };
  }

  private async fetchWithTimeout(url: string, body: string): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, {
        method: "POST",
        headers: this.headers(body),
        body,
        signal: ctrl.signal,
      });
    } catch (e) {
      const name = (e as { name?: string } | undefined)?.name;
      if (name === "AbortError") throw new LicenseError("timeout", "request timed out");
      throw new LicenseError("network", (e as Error)?.message ?? "network error");
    } finally {
      clearTimeout(timer);
    }
  }

  private async signedRequest(
    path: string,
    bodyObj: Record<string, unknown>,
  ): Promise<Record<string, any>> {
    const body = JSON.stringify(bodyObj);
    const url = this.baseUrl + path;
    let lastErr: LicenseError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await sleep(this.backoffFn(attempt));

      let res: Response;
      try {
        res = await this.fetchWithTimeout(url, body);
      } catch (e) {
        lastErr = e instanceof LicenseError ? e : new LicenseError("network");
        if (lastErr.retryable) continue;
        throw lastErr;
      }

      if (res.status >= 500) {
        lastErr = new LicenseError("server", `HTTP ${res.status}`, res.status);
        continue;
      }

      const data = (await res.json().catch(() => null)) as Record<string, any> | null;

      if (res.status >= 400) {
        throw new LicenseError(mapReason(data?.message), String(data?.message ?? "bad request"), res.status);
      }
      if (!data || typeof data !== "object" || typeof data.token !== "string") {
        throw new LicenseError("invalid_response", "unexpected response shape", res.status);
      }
      return data;
    }

    throw lastErr ?? new LicenseError("network", "request failed");
  }
}
