import { describe, it, expect, vi } from "vitest";
import { LicenseClient } from "../src/client";
import { LicenseError } from "../src/errors";
import { MemoryStorage } from "../src/storage";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const base = {
  baseUrl: "https://x",
  productKey: "autotk",
  productSecret: "sec",
  deviceId: "dev1",
  backoffMs: () => 0, // 测试无延迟
};

describe("LicenseClient", () => {
  it("activate 成功：存 token + 带签名头", async () => {
    const storage = new MemoryStorage();
    const fetchImpl = vi.fn(async () =>
      jsonResponse(201, { ok: true, token: "TKN", expiresAt: Date.now() + 3_600_000, reused: false }),
    );
    const c = new LicenseClient({ ...base, storage, fetchImpl });
    const r = await c.activate("AAAA-BBBB");
    expect(r.token).toBe("TKN");
    expect(await c.getToken()).toBe("TKN");
    expect(await c.isActivated()).toBe(true);

    const init = fetchImpl.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers["x-signature"]).toMatch(/^[0-9a-f]{64}$/);
    expect(init.headers["x-product-key"]).toBe("autotk");
    expect(init.headers["x-nonce"]).toBeTruthy();
  });

  it("activate 业务拒绝(device_limit)：抛错且不重试", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(400, { message: "device_limit" }));
    const c = new LicenseClient({ ...base, fetchImpl, maxRetries: 3 });
    await expect(c.activate("X")).rejects.toMatchObject({ code: "device_limit" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("网络错误重试后成功", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => {
      if (n++ < 2) throw Object.assign(new Error("conn reset"), { name: "TypeError" });
      return jsonResponse(201, { token: "OK", expiresAt: Date.now() + 1000 });
    });
    const c = new LicenseClient({ ...base, fetchImpl, maxRetries: 3 });
    const r = await c.activate("X");
    expect(r.token).toBe("OK");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("5xx 重试耗尽后抛 server", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(503, { message: "down" }));
    const c = new LicenseClient({ ...base, fetchImpl, maxRetries: 2 });
    await expect(c.activate("X")).rejects.toMatchObject({ code: "server" });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 + 2 重试
  });

  it("超时：抛 timeout", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          init?.signal?.addEventListener("abort", () =>
            rej(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    const c = new LicenseClient({ ...base, fetchImpl: fetchImpl as typeof fetch, timeoutMs: 30, maxRetries: 0 });
    await expect(c.activate("X")).rejects.toMatchObject({ code: "timeout" });
  });

  it("离线宽限：未过期可用，过期失效", async () => {
    const storage = new MemoryStorage();
    let now = 1000;
    const fetchImpl = vi.fn(async () => jsonResponse(201, { token: "T", expiresAt: 5000 }));
    const c = new LicenseClient({ ...base, storage, fetchImpl, now: () => now });
    await c.activate("X");
    expect(await c.getToken()).toBe("T");
    now = 6000;
    expect(await c.getToken()).toBe(null);
    expect(await c.isActivated()).toBe(false);
  });

  it("heartbeat 被封：清缓存并抛 revoked", async () => {
    const storage = new MemoryStorage();
    await storage.set(
      "license:autotk",
      JSON.stringify({ token: "old", expiresAt: Date.now() + 1000, deviceId: "dev1", code: "C" }),
    );
    const fetchImpl = vi.fn(async () => jsonResponse(400, { message: "revoked" }));
    const c = new LicenseClient({ ...base, storage, fetchImpl });
    await expect(c.heartbeat()).rejects.toMatchObject({ code: "revoked" });
    expect(await c.getStored()).toBe(null);
  });

  it("空码 / 缺参数：抛 bad_request", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { token: "T", expiresAt: 1 }));
    const c = new LicenseClient({ ...base, fetchImpl });
    await expect(c.activate("   ")).rejects.toMatchObject({ code: "bad_request" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(() => new LicenseClient({ ...base, baseUrl: "" })).toThrow(LicenseError);
  });

  it("坏响应(无 token)：抛 invalid_response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { ok: true }));
    const c = new LicenseClient({ ...base, fetchImpl });
    await expect(c.activate("X")).rejects.toMatchObject({ code: "invalid_response" });
  });
});
