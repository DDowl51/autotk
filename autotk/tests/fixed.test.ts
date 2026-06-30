import test from "node:test";
import assert from "node:assert/strict";
import { expandPlaceholders, createFixedReplyGenerator } from "../src/gen/fixed";

test("expandPlaceholders: 各占位符", () => {
  assert.equal(expandPlaceholders("hello", {}), "hello");
  assert.ok(["a", "b", "c"].includes(expandPlaceholders("{a|b|c}")), "{a|b|c} 应择一");
  assert.ok(!/\{emoji\}/.test(expandPlaceholders("{emoji}")), "{emoji} 应被展开");
  assert.equal(expandPlaceholders("{user} hi", { user: "@tom" }), "@tom hi");
  assert.equal(expandPlaceholders("{user} hi", {}), "hi", "空 user 应归一化空格");
  assert.equal(expandPlaceholders("love the {kw}", { keyword: "bikini" }), "love the bikini");
});

test("createFixedReplyGenerator: 空列表→空串", async () => {
  const g = createFixedReplyGenerator([]);
  assert.equal(await g.reply({ videoCaption: "", targetComment: "" }), "");
});

test("createFixedReplyGenerator: 从列表取并展开", async () => {
  const g = createFixedReplyGenerator(["MARK {emoji}"]);
  const r = await g.reply({ videoCaption: "", targetComment: "", author: "@x" });
  assert.match(r, /^MARK /);
  assert.ok(!/[{}]/.test(r), "不应残留花括号占位符");
});
