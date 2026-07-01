import test from "node:test";
import assert from "node:assert/strict";
import { hydrateStoredParams, serializeParams } from "../src/params/persist";
import { DEFAULT_PARAMS } from "../src/params/defaults";

test("空/无存档 → 默认参数", () => {
  assert.deepEqual(hydrateStoredParams(null), DEFAULT_PARAMS);
  assert.deepEqual(hydrateStoredParams(undefined), DEFAULT_PARAMS);
  assert.deepEqual(hydrateStoredParams(""), DEFAULT_PARAMS);
});

test("损坏/非对象 JSON → 回退默认，绝不抛", () => {
  assert.deepEqual(hydrateStoredParams("{不是json"), DEFAULT_PARAMS);
  assert.deepEqual(hydrateStoredParams("[1,2,3]"), DEFAULT_PARAMS);
  assert.deepEqual(hydrateStoredParams('"just a string"'), DEFAULT_PARAMS);
  assert.deepEqual(hydrateStoredParams("null"), DEFAULT_PARAMS);
});

test("往返一致：serialize → hydrate 得到原参数", () => {
  const custom = { ...DEFAULT_PARAMS, clickWaitTime: 3, searchKeywords: ["a", "b"] };
  assert.deepEqual(hydrateStoredParams(serializeParams(custom)), custom);
});

test("顶层部分存档：只覆盖填了的字段，其余取默认", () => {
  const out = hydrateStoredParams(JSON.stringify({ clickWaitTime: 5 }));
  assert.equal(out.clickWaitTime, 5);
  assert.equal(out.kwSearchExecRatio, DEFAULT_PARAMS.kwSearchExecRatio);
  assert.deepEqual(out.taskWindows, DEFAULT_PARAMS.taskWindows);
});

test("旧存档缺新增字段 → 从默认补齐（版本前向兼容）", () => {
  // 模拟旧版存档：整份 DEFAULT 但缺失一个嵌套字段。
  const old = JSON.parse(serializeParams(DEFAULT_PARAMS));
  delete old.forYou.videoSaveProb;
  delete old.clickWaitTime;
  const out = hydrateStoredParams(JSON.stringify(old));
  assert.equal(out.forYou.videoSaveProb, DEFAULT_PARAMS.forYou.videoSaveProb);
  assert.equal(out.clickWaitTime, DEFAULT_PARAMS.clickWaitTime);
});

test("模块子对象深合并：填的字段覆盖，未填保持默认", () => {
  const out = hydrateStoredParams(JSON.stringify({ forYou: { videoLikeProb: 0.9 } }));
  assert.equal(out.forYou.videoLikeProb, 0.9);
  assert.equal(out.forYou.interactProb, DEFAULT_PARAMS.forYou.interactProb);
  assert.equal(out.kwSearch.videoLikeProb, DEFAULT_PARAMS.kwSearch.videoLikeProb);
});
