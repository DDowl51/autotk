import test from "node:test";
import assert from "node:assert/strict";
import {
  signRequest,
  verifyRequest,
  generateCode,
  normalizeCode,
  formatCode,
  decideActivation,
} from "../src/core";

test("HMAC 签名：正确通过、错误/改 body/超时拒绝", () => {
  const secret = "s3cret";
  const ts = Date.now();
  const parts = { productKey: "autotk", timestamp: ts, nonce: "abc", body: '{"x":1}' };
  const sign = signRequest(secret, parts);
  assert.ok(verifyRequest(secret, parts, sign, { now: ts }));
  assert.ok(!verifyRequest("wrong", parts, sign, { now: ts }), "错 secret 应失败");
  assert.ok(!verifyRequest(secret, { ...parts, body: '{"x":2}' }, sign, { now: ts }), "改 body 应失败");
  assert.ok(
    !verifyRequest(secret, parts, sign, { now: ts + 10 * 60 * 1000 }),
    "时间戳超窗应失败",
  );
});

test("发码/规范化/格式化", () => {
  assert.match(generateCode(), /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
  assert.equal(normalizeCode(" abcd-efgh "), "ABCDEFGH");
  assert.equal(formatCode("ABCDEFGH"), "ABCD-EFGH");
});

test("激活决策：各分支", () => {
  const base = { status: "ACTIVE" as const, maxDevices: 2, expiresAt: null };
  assert.deepEqual(decideActivation(base, [], "d1"), { ok: true, reused: false });
  assert.deepEqual(
    decideActivation(base, [{ deviceId: "d1", revoked: false }], "d1"),
    { ok: true, reused: true },
  );
  assert.deepEqual(
    decideActivation(
      base,
      [{ deviceId: "a", revoked: false }, { deviceId: "b", revoked: false }],
      "d3",
    ),
    { ok: false, reason: "device_limit" },
  );
  assert.deepEqual(
    decideActivation(base, [{ deviceId: "d1", revoked: true }], "d1"),
    { ok: false, reason: "revoked" },
  );
  assert.deepEqual(decideActivation({ ...base, status: "DISABLED" }, [], "d1"), {
    ok: false,
    reason: "disabled",
  });
  assert.deepEqual(decideActivation({ ...base, expiresAt: 1000 }, [], "d1", 2000), {
    ok: false,
    reason: "expired",
  });
});
