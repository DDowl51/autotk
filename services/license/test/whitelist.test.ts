import test from "node:test";
import assert from "node:assert/strict";
import { isProductAllowed, visibleCodes } from "../src/core";

test("isProductAllowed: ADMIN 恒 true（不受白名单约束）", () => {
  assert.equal(isProductAllowed("ADMIN", [], "p1"), true);
  assert.equal(isProductAllowed("ADMIN", ["p2"], "p1"), true);
});

test("isProductAllowed: USER 仅白名单内", () => {
  assert.equal(isProductAllowed("USER", ["p1", "p2"], "p1"), true);
  assert.equal(isProductAllowed("USER", ["p1", "p2"], "p3"), false);
});

test("isProductAllowed: USER 空白名单一律拒绝（显式授权）", () => {
  assert.equal(isProductAllowed("USER", [], "p1"), false);
});

test("isProductAllowed: OPERATOR 与 USER 同规则（按白名单，不像 ADMIN 恒 true）", () => {
  assert.equal(isProductAllowed("OPERATOR", ["p1"], "p1"), true);
  assert.equal(isProductAllowed("OPERATOR", ["p1"], "p2"), false);
  assert.equal(isProductAllowed("OPERATOR", [], "p1"), false);
});

test("visibleCodes: ADMIN 全见", () => {
  const codes = [{ productId: "p1" }, { productId: "p2" }];
  assert.deepEqual(visibleCodes("ADMIN", [], codes), codes);
});

test("visibleCodes: USER 仅白名单内产品的码（连带隐藏）", () => {
  const codes = [
    { id: "a", productId: "p1" },
    { id: "b", productId: "p2" },
    { id: "c", productId: "p1" },
  ];
  assert.deepEqual(
    visibleCodes("USER", ["p1"], codes).map((c) => c.id),
    ["a", "c"],
  );
  assert.deepEqual(visibleCodes("USER", [], codes), []);
});
