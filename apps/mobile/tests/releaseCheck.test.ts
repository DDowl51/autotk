import test from "node:test";
import assert from "node:assert/strict";
import { releaseConfigErrors } from "../src/license/releaseCheck";

test("占位/FILL_/空 → 三项都报错", () => {
  assert.equal(
    releaseConfigErrors({
      baseUrl: "https://your-license-server.example.com",
      productKey: "FILL_PRODUCT_KEY",
      productSecret: "FILL_PRODUCT_SECRET",
    }).length,
    3,
  );
  assert.equal(releaseConfigErrors({ baseUrl: "", productKey: "", productSecret: "" }).length, 3);
});

test("填好 → 无错误", () => {
  assert.deepEqual(
    releaseConfigErrors({
      baseUrl: "https://lic.example.io",
      productKey: "prod_abc",
      productSecret: "sec_xyz",
    }),
    [],
  );
});

test("部分填好 → 只报缺的那项", () => {
  const e = releaseConfigErrors({
    baseUrl: "https://lic.example.io",
    productKey: "FILL_PRODUCT_KEY",
    productSecret: "sec_xyz",
  });
  assert.equal(e.length, 1);
});
