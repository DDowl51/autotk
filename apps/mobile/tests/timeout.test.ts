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
