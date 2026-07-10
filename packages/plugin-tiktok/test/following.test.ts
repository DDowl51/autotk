import { describe, expect, it } from "vitest";
import type { TextLine } from "@auto/core";
import { followMonitor } from "../src/workflows/following";
import { pageHazards } from "../src/targets";
import { defaultParams, type TikTokParams } from "../src/params";
import { FakeApp } from "./fake";
import { makeCtx } from "./helpers";

const line = (t: string, y: number): TextLine => ({ text: t, box: [0.05, y, 0.35, y + 0.015] });
const comment = (author: string, text: string, y: number): TextLine[] => [line(author, y), line(text, y + 0.018)];

function followParams(over: Partial<TikTokParams> = {}): Partial<TikTokParams> {
  return {
    postReplies: true,
    following: { ...defaultParams.following, moduleEnable: true },
    ...over,
  };
}

describe("followMonitor", () => {
  it("未开启 → 跳过", async () => {
    const app = new FakeApp().show("feed.rail");
    const { ctx } = makeCtx(app, { following: { ...defaultParams.following, moduleEnable: false } });
    await followMonitor(ctx, pageHazards("feed"));
    expect(app.taps).toEqual([]);
  });

  it("切关注流 → 打粉一条 → 文案静止判到底 → 切回推荐流", async () => {
    const app = new FakeApp().show("feed.rail").show("nav.following-tab").show("nav.foryou-tab").show("feed.comment");
    app.dyn("like heart", [0.85, 0.4, 0.92, 0.42]).dyn("Reply link", [0.2, 0.4, 0.3, 0.42]).show("comments.input").show("comments.send");
    // 文案(视频上,评论区外 y>0.86)+ 评论,从一开始就可见(静止 → 第二轮判到底)
    app.lines = [line("视频文案abc", 0.87), ...comment("buyer", "buy this now", 0.4)];
    app.on("feed.comment", (a) => a.show("comments.panel"));
    const { ctx } = makeCtx(app, followParams());
    await followMonitor(ctx, pageHazards("feed"), 5);

    expect(app.taps).toEqual(expect.arrayContaining(["nav.following-tab", "feed.comment", "nav.foryou-tab"]));
    expect(ctx.stats.videosWatched).toBe(1); // 文案静止 → 第二轮判到底
    expect(ctx.stats.commentLikes).toBeGreaterThanOrEqual(1); // 打粉点赞
    expect(ctx.stats.commentReplies).toBeGreaterThanOrEqual(1); // 打粉回复(命中词优先/无词全回)
  });
});
