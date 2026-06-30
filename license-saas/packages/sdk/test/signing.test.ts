import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { signRequest } from "../src/signing";

// 关键：SDK 的 js-sha256 HMAC 必须与服务端 node:crypto 的 HMAC-SHA256 逐字节一致，
// 否则服务端验签永远失败。这里对多种输入（含 unicode）逐一比对。
describe("HMAC 跨实现一致性（SDK js-sha256 vs node:crypto）", () => {
  const cases = [
    { secret: "s", parts: { productKey: "autotk", timestamp: 1700000000000, nonce: "n1", body: "{}" } },
    {
      secret: "another-secret-长一点",
      parts: { productKey: "p", timestamp: 1, nonce: "abc", body: '{"code":"X","deviceId":"d"}' },
    },
    {
      secret: "🔑emoji-secret",
      parts: { productKey: "k", timestamp: 9999999999999, nonce: "z9", body: "中文 body 测试 😀" },
    },
  ];

  for (const c of cases) {
    it(`匹配: ${c.parts.body}`, () => {
      const payload = `${c.parts.productKey}\n${c.parts.timestamp}\n${c.parts.nonce}\n${c.parts.body}`;
      const expected = createHmac("sha256", c.secret).update(payload, "utf8").digest("hex");
      expect(signRequest(c.secret, c.parts)).toBe(expected);
    });
  }
});
