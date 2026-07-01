import test from "node:test";
import assert from "node:assert/strict";
import { runFollowingFeed } from "../src/engine/modules/followingFeed";
import { createMockUI } from "../src/engine/mockUI";
import { createFixedReplyGenerator } from "../src/gen/fixed";
import { DEFAULT_PARAMS, type AutomationParams } from "../src/params";
import { emptyStats, type RunContext } from "../src/engine/types";
import type { CommentInfo, TikTokUI } from "../src/engine/tiktok-ui";

function mkCtx(params: AutomationParams): RunContext {
  return {
    params,
    stats: emptyStats(),
    logger: { log: () => {} },
    shouldStop: () => false,
    withinWindow: () => true,
    sleep: async () => {},
  };
}

function mkUI() {
  const calls = { following: 0, replies: [] as { author?: string; text: string }[] };
  const base = createMockUI(() => {});
  const ui: TikTokUI = {
    ...base,
    openFollowingFeed: async () => {
      calls.following++;
    },
    swipeToNextVideo: async () => {},
    listComments: async (): Promise<CommentInfo[]> => [
      { index: 0, text: "how much to buy", author: "alice" },
      { index: 1, text: "nice video", author: "bob" },
    ],
    likeComment: async () => {},
    replyComment: async (c: CommentInfo, t: string) => {
      calls.replies.push({ author: c.author, text: t });
    },
  };
  return { ui, calls };
}

// following 模块参数：开启、必进评论区、必回复、不点赞。
const following = (
  over: Partial<AutomationParams["following"]>,
): AutomationParams["following"] => ({
  ...DEFAULT_PARAMS.following,
  moduleEnable: true,
  interactEnable: true,
  interactProb: 1,
  commentLikeProb: 0,
  commentReplyProb: 1,
  commentReplyMaxCount: 5,
  ...over,
});

test("关注监控：切到关注流 + 用打粉专用关键词/话术（覆盖全局）", async () => {
  const { ui, calls } = mkUI();
  const params: AutomationParams = {
    ...DEFAULT_PARAMS,
    allDay: true,
    postReplies: true,
    clickWaitTime: 0,
    commentMatchKeywords: ["zzz"], // 全局词故意不命中
    fixedReplies: ["GLOBAL {user}"],
    following: following({ commentMatchKeywords: ["buy"], fixedReplies: ["FUNNEL {user}"] }),
  };
  await runFollowingFeed(mkCtx(params), ui, createFixedReplyGenerator(params.fixedReplies), 1);

  assert.equal(calls.following, 1, "应切到关注流");
  assert.ok(calls.replies.length > 0, "应有回复");
  assert.ok(calls.replies.every((r) => r.author === "alice"), "只回复命中打粉词 buy 的 alice");
  assert.ok(
    calls.replies.every((r) => /FUNNEL/.test(r.text) && /@alice/.test(r.text)),
    "应用打粉话术并 @作者: " + JSON.stringify(calls.replies),
  );
});

test("关注监控：覆盖留空 → 沿用全局关键词/话术", async () => {
  const { ui, calls } = mkUI();
  const params: AutomationParams = {
    ...DEFAULT_PARAMS,
    allDay: true,
    postReplies: true,
    clickWaitTime: 0,
    commentMatchKeywords: ["buy"],
    fixedReplies: ["GLOBAL {user}"],
    following: following({ commentMatchKeywords: [], fixedReplies: [] }),
  };
  await runFollowingFeed(mkCtx(params), ui, createFixedReplyGenerator(params.fixedReplies), 1);

  assert.ok(calls.replies.length > 0, "应有回复");
  assert.ok(calls.replies.every((r) => r.author === "alice"), "全局词 buy 命中 alice");
  assert.ok(
    calls.replies.every((r) => /GLOBAL/.test(r.text)),
    "覆盖留空应沿用全局话术: " + JSON.stringify(calls.replies),
  );
});
