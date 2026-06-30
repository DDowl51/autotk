import test from "node:test";
import assert from "node:assert/strict";
import { TelemetryClient } from "../src/client";
import type { TelemetryStorage, IngestPayload, FetchLike } from "../src/types";

function memStore(initial?: Record<string, string>): TelemetryStorage {
  const m = new Map<string, string>(Object.entries(initial ?? {}));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

/** 捕获上报的 fetch；ok 控制成败。 */
function captureFetch(ok = true): { fetch: FetchLike; calls: IngestPayload[] } {
  const calls: IngestPayload[] = [];
  const fetch: FetchLike = async (_url, init) => {
    calls.push(JSON.parse((init as { body: string }).body) as IngestPayload);
    return { ok, status: ok ? 200 : 500 };
  };
  return { fetch, calls };
}

const base = (over: Partial<ConstructorParameters<typeof TelemetryClient>[0]> = {}) => ({
  endpoint: "http://collector/v1/events",
  system: "autotk",
  flushIntervalMs: 0, // 测试里不开定时器
  genId: () => "fixed-id",
  now: () => 1000,
  ...over,
});

test("init：无存储则生成并持久化 anonId", async () => {
  const store = memStore();
  const c = new TelemetryClient(base({ storage: store }));
  await c.init();
  assert.equal(c.id, "fixed-id");
  assert.equal(store.getItem("telemetry.anonId"), "fixed-id");
});

test("init：已有 anonId 则复用", async () => {
  const c = new TelemetryClient(base({ storage: memStore({ "telemetry.anonId": "old-id" }) }));
  await c.init();
  assert.equal(c.id, "old-id");
});

test("track 入队；flush 发出带 system/anonId/events 的载荷并清空", async () => {
  const cap = captureFetch(true);
  const c = new TelemetryClient(base({ fetch: cap.fetch, storage: memStore() }));
  await c.init();
  c.track("app_open");
  c.track("like_video", { module: "forYou" });
  assert.equal(c.pending, 2);
  await c.flush();
  assert.equal(c.pending, 0);
  assert.equal(cap.calls.length, 1);
  const p = cap.calls[0];
  assert.equal(p.system, "autotk");
  assert.equal(p.anonId, "fixed-id");
  assert.equal(p.events.length, 2);
  assert.equal(p.events[1].name, "like_video");
  assert.deepEqual(p.events[1].props, { module: "forYou" });
});

test("上报失败：放回队列、不丢、不抛、onError 触发", async () => {
  const cap = captureFetch(false); // 500
  let errs = 0;
  const c = new TelemetryClient(base({ fetch: cap.fetch, storage: memStore(), onError: () => errs++ }));
  await c.init();
  c.track("a");
  await c.flush();
  assert.equal(c.pending, 1); // 放回了
  assert.equal(errs, 1);
});

test("flushAt 攒够自动发", async () => {
  const cap = captureFetch(true);
  const c = new TelemetryClient(base({ fetch: cap.fetch, storage: memStore(), flushAt: 2 }));
  await c.init();
  c.track("a");
  c.track("b"); // 达到阈值 → 触发 flush
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(cap.calls.length, 1);
  assert.equal(cap.calls[0].events.length, 2);
});

test("maxBuffer 超上限丢最旧", async () => {
  const c = new TelemetryClient(base({ storage: memStore(), maxBuffer: 3, flushAt: 999 }));
  await c.init();
  for (const n of ["1", "2", "3", "4", "5"]) c.track(n);
  assert.equal(c.pending, 3); // 只剩最近 3 条
});

test("shutdown 停定时器并尽力发完", async () => {
  const cap = captureFetch(true);
  const c = new TelemetryClient(base({ fetch: cap.fetch, storage: memStore() }));
  await c.init();
  c.track("x");
  await c.shutdown();
  assert.equal(cap.calls.length, 1);
  assert.equal(c.pending, 0);
});

test("空队列 flush 不发请求", async () => {
  const cap = captureFetch(true);
  const c = new TelemetryClient(base({ fetch: cap.fetch, storage: memStore() }));
  await c.init();
  await c.flush();
  assert.equal(cap.calls.length, 0);
});
