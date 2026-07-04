import test from "node:test";
import assert from "node:assert/strict";
import { fromLegacy, validateParams, DEFAULT_PARAMS } from "../src/params";

test("DEFAULT_PARAMS: 开箱即合法（新机可直接推荐页养号）", () => {
  // 默认 kwSearchExecRatio=0（推荐页养号，无需关键词）→ 校验应完全通过，新买家一开机不撞错。
  assert.deepEqual(validateParams(DEFAULT_PARAMS), []);
});

test("validateParams: 点击间隔必须 >0（0/负被防呆拦下）", () => {
  assert.ok(validateParams({ ...DEFAULT_PARAMS, clickWaitTime: 0 }).some((e) => e.includes("点击间隔")), "0 间隔应被拒");
  assert.ok(validateParams({ ...DEFAULT_PARAMS, clickWaitTime: -1 }).some((e) => e.includes("点击间隔")), "负间隔应被拒");
  assert.deepEqual(validateParams({ ...DEFAULT_PARAMS, clickWaitTime: 0.5 }), [], "0.5 应通过");
});

test("validateParams: 单视频评论互动数过大被防呆拦下（防封号）", () => {
  const badReply = { ...DEFAULT_PARAMS, forYou: { ...DEFAULT_PARAMS.forYou, commentReplyMaxCount: 50 } };
  assert.ok(validateParams(badReply).some((e) => e.includes("过大")), "50 条回复应被拒");
  const badLike = { ...DEFAULT_PARAMS, kwSearch: { ...DEFAULT_PARAMS.kwSearch, commentLikeMaxCount: 999 } };
  assert.ok(validateParams(badLike).some((e) => e.includes("过大")), "999 次点赞应被拒");
});

test("fromLegacy: 有 fixedReplies、无 language（回归 #2）", () => {
  const p = fromLegacy({ search_kw: "a,b", pos_prompt: "x", kw_search_int_exec_prop: 0.5 });
  assert.deepEqual(p.searchKeywords, ["a", "b"]);
  assert.ok(Array.isArray(p.fixedReplies), "应有 fixedReplies 数组");
  assert.ok(!("language" in p), "language 应已移除");
  assert.equal(p.kwSearchExecRatio, 0.5);
});

test("validateParams: 概率越界被抓", () => {
  const bad = { ...DEFAULT_PARAMS, forYou: { ...DEFAULT_PARAMS.forYou, videoLikeProb: 2 } };
  assert.ok(validateParams(bad).some((e) => e.includes("点赞概率")));
});

test("validateParams: 时间窗重叠被抓", () => {
  const bad = {
    ...DEFAULT_PARAMS,
    taskWindows: [
      { start: "07:00:00", end: "12:00:00" },
      { start: "10:00:00", end: "16:00:00" },
    ],
  };
  assert.ok(validateParams(bad).some((e) => e.includes("重叠")));
});
