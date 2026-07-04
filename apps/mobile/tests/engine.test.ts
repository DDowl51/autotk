import test from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "../src/engine";
import { createMockUI } from "../src/engine/mockUI";
import { createFixedReplyGenerator } from "../src/gen/fixed";
import { DEFAULT_PARAMS, type AutomationParams } from "../src/params";

// 用 mock UI 跑通整个引擎管线（调度→推荐页→互动→评论→回复），验证：
//  - 引擎不崩、能停；
//  - 回复来自固定列表且占位符已展开（#2 功能完整性）；
//  - 统计有增长；
//  - 无错误日志（回归）。
test("引擎端到端（mock UI + 固定回复）", async () => {
  const logs: string[] = [];
  const params: AutomationParams = {
    ...DEFAULT_PARAMS,
    allDay: true,
    kwSearchExecRatio: 0, // 只跑推荐页（无需关键词）
    posPrompts: ["*"],
    fixedReplies: ["SMOKE_MARKER {emoji}"],
    postReplies: true,
    clickWaitTime: 0.05,
    forYou: {
      ...DEFAULT_PARAMS.forYou,
      interactEnable: true,
      interactProb: 1,
      videoLikeProb: 0,
      videoSaveProb: 0,
      videoFollowProb: 0,
      commentLikeProb: 0,
      commentReplyProb: 1,
      commentReplyMaxCount: 2,
    },
  };

  const engine = createEngine({
    params,
    ui: createMockUI((m) => logs.push(m)),
    gen: createFixedReplyGenerator(params.fixedReplies),
    logger: { log: (_l, m) => logs.push(m) },
  });

  const runP = engine.start();
  await new Promise((r) => setTimeout(r, 6000));
  engine.stop();
  await runP;

  const all = logs.join("\n");
  assert.ok(/SMOKE_MARKER/.test(all), "回复应来自固定列表（含 SMOKE_MARKER）");
  assert.ok(!/\{emoji\}/.test(all), "占位符应展开，不应出现字面 {emoji}");
  assert.ok(engine.getStats().commentReplies > 0, "应有评论回复计数: " + JSON.stringify(engine.getStats()));
  assert.ok(!/批次出错|错误：/.test(all), "不应有错误日志:\n" + all);
  assert.equal(engine.getModule(), "forYou", "当前模块应被引擎记录");
});

test("updateParams：运行中热更即时生效（postReplies 由 false→true，修 critical 假成功）", async () => {
  const replied: string[] = [];
  const ui = { ...createMockUI(() => {}), replyComment: async (_c: unknown, t: string) => void replied.push(t) };
  const params: AutomationParams = {
    ...DEFAULT_PARAMS,
    allDay: true,
    kwSearchExecRatio: 0, // 只跑推荐页
    posPrompts: ["*"],
    clickWaitTime: 0.01,
    postReplies: false, // 起始：只预览、不真发
    fixedReplies: ["HOT {emoji}"],
    forYou: {
      ...DEFAULT_PARAMS.forYou,
      interactEnable: true,
      interactProb: 1,
      videoLikeProb: 0,
      videoSaveProb: 0,
      videoFollowProb: 0,
      commentLikeProb: 0,
      commentReplyProb: 1,
      commentReplyMaxCount: 2,
    },
  };
  const engine = createEngine({
    params,
    ui,
    gen: createFixedReplyGenerator(params.fixedReplies),
    logger: { log: () => {} },
  });
  const runP = engine.start();
  try {
    await new Promise((r) => setTimeout(r, 4000));
    assert.equal(replied.length, 0, "postReplies=false 时不真发（只预览）");
    // 热更（模拟 Hub 下发把 postReplies 打开）——运行中的引擎应即时读到新值。
    engine.updateParams({ ...params, postReplies: true }, createFixedReplyGenerator(params.fixedReplies));
    await new Promise((r) => setTimeout(r, 6000));
    assert.ok(replied.length > 0, "热更 postReplies=true 后应开始真发: " + replied.length);
  } finally {
    engine.stop();
    await runP;
  }
});
