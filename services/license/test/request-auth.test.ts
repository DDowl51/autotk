import test from "node:test";
import assert from "node:assert/strict";
import { verifySignedRequest } from "../src/domain/request-auth";
import { signRequest } from "../src/core";

const secret = "prod-secret";
const body = '{"code":"X","deviceId":"d1"}';

function headersFor(ts: number) {
  const sig = signRequest(secret, { productKey: "autotk", timestamp: ts, nonce: "n1", body });
  return {
    "x-product-key": "autotk",
    "x-timestamp": String(ts),
    "x-nonce": "n1",
    "x-signature": sig,
  };
}

test("verifySignedRequest: 正确签名通过", () => {
  const ts = Date.now();
  assert.ok(verifySignedRequest(secret, headersFor(ts), body, { now: ts }));
});

test("verifySignedRequest: 缺头/错 secret/改 body 拒绝", () => {
  const ts = Date.now();
  const h = headersFor(ts);
  assert.ok(!verifySignedRequest(secret, { ...h, "x-signature": undefined }, body, { now: ts }), "缺签名");
  assert.ok(!verifySignedRequest("wrong", h, body, { now: ts }), "错 secret");
  assert.ok(!verifySignedRequest(secret, h, body + "x", { now: ts }), "改 body");
});

test("verifySignedRequest: 时间戳非法/超窗拒绝", () => {
  const ts = Date.now();
  assert.ok(!verifySignedRequest(secret, { ...headersFor(ts), "x-timestamp": "abc" }, body, { now: ts }), "非法时间戳");
  assert.ok(!verifySignedRequest(secret, headersFor(ts), body, { now: ts + 10 * 60 * 1000 }), "超窗");
});
