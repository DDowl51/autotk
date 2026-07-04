import test from "node:test";
import assert from "node:assert/strict";
import { withTimeout } from "../src/engine/timeout";

test("超时前 resolve → 正常返回", async () => {
  assert.equal(await withTimeout(Promise.resolve(42), 1), 42);
});

test("超时 → 抛超时错", async () => {
  const never = new Promise<number>(() => {}); // 永不 settle
  let err: unknown;
  try {
    await withTimeout(never, 0.05);
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof Error);
  assert.match((err as Error).message, /超时/);
});

test("超时 → 触发 onTimeout（引擎据此中止被放弃的模块循环）", async () => {
  const never = new Promise<number>(() => {});
  let aborted = false;
  try {
    await withTimeout(never, 0.05, () => (aborted = true));
  } catch {
    /* 预期抛超时 */
  }
  assert.ok(aborted, "超时应回调 onTimeout");
});

test("未超时 → 不触发 onTimeout", async () => {
  let aborted = false;
  await withTimeout(Promise.resolve(1), 1, () => (aborted = true));
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(!aborted, "正常返回不应回调 onTimeout");
});

test("原 promise 先 reject → 透传错误", async () => {
  let err: unknown;
  try {
    await withTimeout(Promise.reject(new Error("boom")), 1);
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof Error);
  assert.match((err as Error).message, /boom/);
});
