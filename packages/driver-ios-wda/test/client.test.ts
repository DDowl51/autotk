import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WdaClient, WdaError } from "../src/client";

// —— mock 全局 fetch:队列化响应,记录每次调用 ——
interface MockResp {
  status?: number;
  value?: unknown;
  sessionId?: string | null;
  reject?: Error;
}
let queue: MockResp[] = [];
let calls: { url: string; method: string; body?: unknown }[] = [];

function enqueue(...rs: MockResp[]): void {
  queue.push(...rs);
}

beforeEach(() => {
  queue = [];
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: { method?: string; body?: string }) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(init.body) : undefined,
      });
      const r = queue.shift() ?? { value: null };
      if (r.reject) throw r.reject;
      const status = r.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => ({ value: r.value ?? null, sessionId: r.sessionId ?? null }),
      } as Response;
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

/** 建好会话的 client,并清掉建会话产生的调用记录。 */
async function withSession(base = "http://dev:8100"): Promise<WdaClient> {
  enqueue({ value: { sessionId: "S1" } }, { value: {} }); // POST /session, POST /appium/settings
  const c = new WdaClient(base);
  await c.createSession();
  calls.length = 0;
  return c;
}

describe("会话", () => {
  it("createSession:建空会话 + 立即下发提速设置,存 sessionId", async () => {
    enqueue({ value: { sessionId: "S1" } }, { value: {} });
    const c = new WdaClient("http://dev:8100");
    await c.createSession();
    expect(c.getSessionId()).toBe("S1");
    expect(calls[0]).toMatchObject({ url: "http://dev:8100/session", method: "POST" });
    expect(calls[1].url).toBe("http://dev:8100/session/S1/appium/settings");
    expect((calls[1].body as { settings: Record<string, unknown> }).settings.snapshotMaxDepth).toBe(1);
  });

  it("baseUrl 末尾斜杠被去掉", async () => {
    enqueue({ value: { sessionId: "S1" } }, { value: {} });
    const c = new WdaClient("http://dev:8100/");
    await c.createSession();
    expect(calls[0].url).toBe("http://dev:8100/session");
  });

  it("未建会话就操作 → WdaError", async () => {
    const c = new WdaClient("http://dev:8100");
    await expect(c.tap({ x: 1, y: 1 })).rejects.toBeInstanceOf(WdaError);
  });
});

describe("触控 /actions", () => {
  it("tap:W3C pointer 体,坐标取整", async () => {
    const c = await withSession();
    enqueue({ value: null });
    await c.tap({ x: 100.7, y: 200.2 });
    expect(calls[0].url).toBe("http://dev:8100/session/S1/actions");
    const acts = (calls[0].body as { actions: { actions: { type: string; x?: number; y?: number }[] }[] }).actions[0].actions;
    expect(acts.map((a) => a.type)).toEqual(["pointerMove", "pointerDown", "pause", "pointerUp"]);
    expect(acts[0]).toMatchObject({ x: 101, y: 200 }); // 取整
  });

  it("swipe:第二个 pointerMove 带时长与终点", async () => {
    const c = await withSession();
    enqueue({ value: null });
    await c.swipe({ x: 10, y: 20 }, { x: 30, y: 40 }, 250);
    const acts = (calls[0].body as { actions: { actions: { type: string; duration?: number; x?: number; y?: number }[] }[] }).actions[0].actions;
    const moves = acts.filter((a) => a.type === "pointerMove");
    expect(moves).toHaveLength(2);
    expect(moves[1]).toMatchObject({ duration: 250, x: 30, y: 40 });
  });
});

describe("输入 / 截图 / 窗口 / 前台", () => {
  it("typeText:/wda/keys {value:[...chars]}", async () => {
    const c = await withSession();
    enqueue({ value: null });
    await c.typeText("ab你");
    expect(calls[0].url).toBe("http://dev:8100/session/S1/wda/keys");
    expect((calls[0].body as { value: string[] }).value).toEqual(["a", "b", "你"]);
  });

  it("screenshot:base64 → Uint8Array 解码", async () => {
    const c = await withSession();
    const b64 = Buffer.from("PNGDATA").toString("base64");
    enqueue({ value: b64 });
    const bytes = await c.screenshot();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(bytes).toString()).toBe("PNGDATA");
  });

  it("windowSize:返回逻辑分辨率", async () => {
    const c = await withSession();
    enqueue({ value: { width: 375, height: 667 } });
    expect(await c.windowSize()).toEqual({ width: 375, height: 667 });
  });

  it("activateApp:默认 TikTok bundleId", async () => {
    const c = await withSession();
    enqueue({ value: null });
    await c.activateApp();
    expect(calls[0].url).toBe("http://dev:8100/session/S1/wda/apps/activate");
    expect((calls[0].body as { bundleId: string }).bundleId).toBe("com.zhiliaoapp.musically");
  });
});

describe("错误与自愈", () => {
  it("非 2xx → WdaError(带 status 与 message)", async () => {
    const c = await withSession();
    enqueue({ status: 500, value: { message: "boom" } });
    await expect(c.windowSize()).rejects.toMatchObject({ name: "WdaError", status: 500, message: "boom" });
  });

  it("AbortError(超时)→ WdaError status 0", async () => {
    const c = await withSession();
    enqueue({ reject: Object.assign(new Error("aborted"), { name: "AbortError" }) });
    await expect(c.windowSize()).rejects.toMatchObject({ name: "WdaError", status: 0 });
  });

  it("ensureHealthy:无 session → 建会话", async () => {
    enqueue({ value: { sessionId: "S1" } }, { value: {} });
    const c = new WdaClient("http://dev:8100");
    await c.ensureHealthy();
    expect(c.getSessionId()).toBe("S1");
  });

  it("ensureHealthy:探测正常 → 不重建", async () => {
    const c = await withSession();
    enqueue({ value: { width: 375, height: 667 } }); // 探测 window/size OK
    await c.ensureHealthy();
    expect(calls).toHaveLength(1); // 只探测一次,未重建
    expect(c.getSessionId()).toBe("S1");
  });

  it("ensureHealthy:探测 404 → 清 session 重建", async () => {
    const c = await withSession();
    enqueue(
      { status: 404, value: { message: "invalid session" } }, // 探测失败
      { value: { sessionId: "S2" } }, // 重建 /session
      { value: {} }, // 重建 settings
    );
    await c.ensureHealthy();
    expect(c.getSessionId()).toBe("S2");
    expect(calls.map((x) => x.url)).toEqual([
      "http://dev:8100/session/S1/window/size",
      "http://dev:8100/session",
      "http://dev:8100/session/S2/appium/settings",
    ]);
  });
});
