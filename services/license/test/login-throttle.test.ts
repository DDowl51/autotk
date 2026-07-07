import test from "node:test";
import assert from "node:assert/strict";
import {
  createThrottleState,
  lockedSeconds,
  recordFailure,
  recordSuccess,
} from "../src/core/login-throttle";

const OPTS = { maxFails: 3, windowMs: 1000, lockMs: 5000 };

test("窗口内累计到 maxFails 才上锁", () => {
  const s = createThrottleState();
  recordFailure(s, "ip", 0, OPTS);
  recordFailure(s, "ip", 10, OPTS);
  assert.equal(lockedSeconds(s, "ip", 20), 0, "两次失败还没锁");
  recordFailure(s, "ip", 20, OPTS); // 第 3 次触顶
  assert.equal(lockedSeconds(s, "ip", 20), 5, "锁 5 秒");
  assert.equal(lockedSeconds(s, "ip", 5019), 1, "临近解锁");
  assert.equal(lockedSeconds(s, "ip", 5020), 0, "锁到期");
});

test("成功登录清零，重新从头计", () => {
  const s = createThrottleState();
  recordFailure(s, "ip", 0, OPTS);
  recordFailure(s, "ip", 10, OPTS);
  recordSuccess(s, "ip");
  recordFailure(s, "ip", 20, OPTS);
  recordFailure(s, "ip", 30, OPTS);
  assert.equal(lockedSeconds(s, "ip", 40), 0, "清零后又两次，未触顶");
});

test("超过窗口的失败重置计数（慢速尝试不累积）", () => {
  const s = createThrottleState();
  recordFailure(s, "ip", 0, OPTS);
  recordFailure(s, "ip", 2000, OPTS); // 距上次 > windowMs → 重置窗口
  recordFailure(s, "ip", 2010, OPTS);
  assert.equal(lockedSeconds(s, "ip", 2020), 0, "跨窗口不累积到锁");
});

test("按 key 隔离：一个 IP 被锁不影响另一个", () => {
  const s = createThrottleState();
  recordFailure(s, "a", 0, OPTS);
  recordFailure(s, "a", 10, OPTS);
  recordFailure(s, "a", 20, OPTS);
  assert.ok(lockedSeconds(s, "a", 20) > 0, "a 被锁");
  assert.equal(lockedSeconds(s, "b", 20), 0, "b 不受影响");
});
