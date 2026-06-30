import test from "node:test";
import assert from "node:assert/strict";
import { applyConfigPatch } from "../src/hub/configInbox";
import { DEFAULT_PARAMS } from "../src/params/defaults";
import { validateParams } from "../src/params/parse";
import type { AutomationParams } from "../src/params/types";

// DEFAULT_PARAMS 故意带「缺搜索关键词」一条（启用了搜索但没填词）。
// 补一个关键词得到一个「干净合法」的基准，便于验证补丁行为。
const BASE: AutomationParams = { ...DEFAULT_PARAMS, searchKeywords: ["test"] };

test("基准参数合法（前提）", () => {
  assert.deepEqual(validateParams(BASE), []);
});

test("应用顶层标量补丁：只改填的字段", () => {
  const r = applyConfigPatch(BASE, { clickWaitTime: 2 });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.next.clickWaitTime, 2);
    assert.equal(r.next.kwSearchExecRatio, BASE.kwSearchExecRatio); // 其它不变
  }
});

test("应用模块子补丁：深合并，模块内未填字段保持原值", () => {
  const r = applyConfigPatch(BASE, { forYou: { videoLikeProb: 0.9 } });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.next.forYou.videoLikeProb, 0.9);
    assert.equal(r.next.forYou.interactProb, BASE.forYou.interactProb);
    assert.equal(r.next.kwSearch.videoLikeProb, BASE.kwSearch.videoLikeProb);
  }
});

test("数组字段整体替换（不合并）", () => {
  const r = applyConfigPatch(BASE, { fixedReplies: ["only one"] });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.next.fixedReplies, ["only one"]);
});

test("不改动原对象（纯函数）", () => {
  const before = BASE.forYou.videoLikeProb;
  applyConfigPatch(BASE, { forYou: { videoLikeProb: 0.99 } });
  assert.equal(BASE.forYou.videoLikeProb, before);
});

test("非法补丁整体拒绝，返回错误串（不半应用）", () => {
  const r = applyConfigPatch(BASE, { forYou: { videoLikeProb: 2 } });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /0~1/);
});

test("把关键词清空又启用搜索互动 → 拒绝", () => {
  const r = applyConfigPatch(BASE, { kwSearchExecRatio: 0.5, searchKeywords: [] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /搜索关键词/);
});

test("空补丁 = 原样通过", () => {
  const r = applyConfigPatch(BASE, {});
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.next, BASE);
});
