import { describe, expect, it } from "vitest";
import { interactComments, type CommentOpts } from "../src/workflows/comments";
import type { Comment } from "../src/comments";
import type { ModuleParams } from "../src/params";
import { FakeApp } from "./fake";
import { makeCtx } from "./helpers";

const cmt = (author: string, text: string, isAd = false): Comment => ({ author, text, y: 0.4, isAd });
const mod = (over: Partial<ModuleParams> = {}): ModuleParams => ({
  interactEnable: true, interactProb: 1, videoLikeProb: 0, videoSaveProb: 0, videoFollowProb: 0,
  commentLikeProb: 0.5, commentReplyProb: 0.5, commentLikeMaxCount: 4, commentReplyMaxCount: 2, ...over,
});
const opts = (over: Partial<CommentOpts> = {}): CommentOpts => ({ matchKeywords: [], replyTemplates: ["hi {user}"], postReplies: true, clickWaitTime: 1, ...over });

describe("interactComments", () => {
  it("点赞非广告评论,跳过广告条(rng=0 概率命中)", async () => {
    const app = new FakeApp().dyn("like heart");
    const { ctx } = makeCtx(app, {});
    const comments = [cmt("a", "nice"), cmt("ad", "Sponsored buy", true), cmt("b", "cool")];
    await interactComments(ctx, mod({ commentReplyProb: 0 }), comments, opts());
    expect(ctx.stats.commentLikes).toBe(2); // a、b 点赞;广告跳过
  });

  it("回复受 commentReplyMaxCount 上限约束", async () => {
    const app = new FakeApp().dyn("Reply link").show("comments.input").show("comments.send");
    const { ctx } = makeCtx(app, {});
    const comments = [cmt("a", "x"), cmt("b", "y"), cmt("c", "z")];
    await interactComments(ctx, mod({ commentLikeProb: 0, commentReplyMaxCount: 2 }), comments, opts());
    expect(ctx.stats.commentReplies).toBe(2); // 封顶 2
  });

  it("配了 matchKeywords → 只回命中的评论", async () => {
    const app = new FakeApp().dyn("Reply link").show("comments.input").show("comments.send");
    const { ctx } = makeCtx(app, {});
    const comments = [cmt("a", "where to buy"), cmt("b", "nice video")];
    await interactComments(ctx, mod({ commentLikeProb: 0 }), comments, opts({ matchKeywords: ["buy"] }));
    expect(ctx.stats.commentReplies).toBe(1); // 只有含 buy 的 a
  });

  it("预览模式(postReplies=false)→ 不真发、不计数、不碰输入框", async () => {
    const app = new FakeApp().dyn("Reply link").show("comments.input").show("comments.send");
    const { ctx } = makeCtx(app, {});
    const comments = [cmt("a", "x"), cmt("b", "y")];
    await interactComments(ctx, mod({ commentLikeProb: 0 }), comments, opts({ postReplies: false }));
    expect(ctx.stats.commentReplies).toBe(0);
    expect(app.typed).toEqual([]); // 预览不输入
  });

  it("话术模板为空 → 不发任何回复", async () => {
    const app = new FakeApp().dyn("Reply link").show("comments.input").show("comments.send");
    const { ctx } = makeCtx(app, {});
    await interactComments(ctx, mod({ commentLikeProb: 0 }), [cmt("a", "x")], opts({ replyTemplates: [] }));
    expect(ctx.stats.commentReplies).toBe(0);
  });
});
