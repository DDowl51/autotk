import test from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "../src/engine";
import { createMockUI } from "../src/engine/mockUI";
import { createFixedReplyGenerator } from "../src/gen/fixed";
import { DEFAULT_PARAMS, type AutomationParams } from "../src/params";
import type { CommentInfo, TikTokUI } from "../src/engine/tiktok-ui";

// 集成验证 #3：进评论区后，只回复"命中评论匹配词"的评论作者，且 {user} 展开为 @作者。
test("#3：仅回复命中匹配词的作者 + {user}→@作者", async () => {
  const replies: { author?: string; text: string }[] = [];
  const base = createMockUI(() => {});
  const ui: TikTokUI = {
    ...base,
    listComments: async (): Promise<CommentInfo[]> => [
      { index: 0, text: "where can I buy this", author: "alice" },
      { index: 1, text: "nice video", author: "bob" },
    ],
    likeComment: async () => {},
    replyComment: async (c: CommentInfo, t: string) => {
      replies.push({ author: c.author, text: t });
    },
  };

  const params: AutomationParams = {
    ...DEFAULT_PARAMS,
    allDay: true,
    kwSearchExecRatio: 0,
    posPrompts: ["*"],
    commentMatchKeywords: ["where", "buy"],
    fixedReplies: ["got it {user} {emoji}"],
    postReplies: true,
    clickWaitTime: 0.02,
    forYou: {
      ...DEFAULT_PARAMS.forYou,
      interactEnable: true,
      interactProb: 1,
      videoLikeProb: 0,
      videoSaveProb: 0,
      videoFollowProb: 0,
      commentLikeProb: 0,
      commentReplyProb: 1,
      commentReplyMaxCount: 5,
    },
  };

  const engine = createEngine({
    params,
    ui,
    gen: createFixedReplyGenerator(params.fixedReplies),
    logger: { log: () => {} },
  });
  const p = engine.start();
  await new Promise((r) => setTimeout(r, 3000));
  engine.stop();
  await p;

  assert.ok(replies.length > 0, "应有回复");
  assert.ok(
    replies.every((r) => r.author === "alice"),
    "只应回复命中 where/buy 的 alice: " + JSON.stringify(replies),
  );
  assert.ok(
    replies.every((r) => /@alice/.test(r.text)),
    "{user} 应展开为 @alice: " + JSON.stringify(replies),
  );
});
