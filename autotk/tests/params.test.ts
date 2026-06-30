import test from "node:test";
import assert from "node:assert/strict";
import { fromLegacy, validateParams, DEFAULT_PARAMS } from "../src/params";

test("DEFAULT_PARAMS: 只应有'缺搜索关键词'这一类报错", () => {
  // 默认 kwSearchExecRatio=0.8 且无 searchKeywords → 已知会有此一类报错，其余应干净。
  const errs = validateParams(DEFAULT_PARAMS);
  assert.ok(
    errs.every((e) => e.includes("搜索关键词")),
    "默认参数除'缺搜索关键词'外不应有别的报错: " + errs.join("; "),
  );
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
