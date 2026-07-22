import { describe, expect, it } from "vitest";
import type { TextLine } from "@auto/core";
import { profileAndDM } from "../src/workflows/profile";
import { pageHazards } from "../src/targets";
import { defaultParams, type TikTokParams } from "../src/params";
import { FakeApp } from "./fake";
import { makeCtx } from "./helpers";

const line = (t: string, y: number): TextLine => ({ text: t, box: [0.05, y, 0.35, y + 0.015] });
/** 一条两行评论(作者行 + 正文行,同簇)。 */
const comment = (author: string, text: string, y: number): TextLine[] => [line(author, y), line(text, y + 0.018)];

function profileWorld(commentLines: TextLine[]): FakeApp {
  const app = new FakeApp().show("feed.rail").show("profile.tab");
  app
    .on("profile.tab", (a) => a.show("profile.grid").show("profile.grid-first"))
    .on("profile.grid-first", (a) => a.hide("profile.grid").hide("profile.grid-first").show("feed.comment"))
    .on("feed.comment", (a) => {
      a.show("comments.panel");
      a.lines = commentLines;
    })
    // DM 链路(全靠点击触发,不依赖 swipe)
    .dyn("profile avatar", [0.05, 0.4, 0.12, 0.42])
    .on("dyn:profile avatar", (a) => a.show("dm.message-button"))
    .on("dm.message-button", (a) => a.show("dm.input"))
    .on("dm.input", (a) => a.show("dm.send"));
  return app;
}

function params(over: Partial<TikTokParams> = {}): Partial<TikTokParams> {
  return {
    persHome: { ...defaultParams.persHome, moduleEnable: true, maxVideoCount: 1, commentLikeProb: 0, commentReplyProb: 0 },
    dm: { dmEnable: true, dmKeywords: ["buy"], dmTemplates: ["hi {user}"], dmDailyCap: 5 },
    ...over,
  };
}

describe("profileAndDM", () => {
  it("未开启主页模块 → 跳过", async () => {
    const app = profileWorld([]);
    const { ctx } = makeCtx(app, { persHome: { ...defaultParams.persHome, moduleEnable: false } });
    await profileAndDM(ctx, pageHazards("profile"), pageHazards("feed"));
    expect(app.taps).toEqual([]);
  });

  it("进主页 → 开评论 → 只私信命中「buy」关键词的评论者(去重记录)", async () => {
    const app = profileWorld([...comment("buyer", "buy this now", 0.4), ...comment("alice", "nice video", 0.55)]);
    const { ctx } = makeCtx(app, params());
    await profileAndDM(ctx, pageHazards("profile"), pageHazards("feed"));

    expect(app.taps).toEqual(expect.arrayContaining(["profile.tab", "profile.grid-first", "feed.comment"]));
    expect(ctx.stats.videosWatched).toBe(1);
    // 只私信了 buyer(命中 buy),没私信 alice
    expect(ctx.stats.dmSent).toBe(1);
    expect(app.typed).toContain("hi buyer");
    expect(await ctx.state.has("dm:self", "buyer")).toBe(true);
    expect(await ctx.state.has("dm:self", "alice")).toBe(false);
    expect(await ctx.state.peekDaily("dm-count", "self")).toBe(1);
  });

  it("dmEnable=false → 不私信任何人", async () => {
    const app = profileWorld([...comment("buyer", "buy this", 0.4)]);
    const { ctx } = makeCtx(app, params({ dm: { dmEnable: false, dmKeywords: ["buy"], dmTemplates: ["hi"], dmDailyCap: 5 } }));
    await profileAndDM(ctx, pageHazards("profile"), pageHazards("feed"));
    expect(ctx.stats.dmSent).toBe(0);
  });

  it("已私信过该人 → 不重发", async () => {
    const app = profileWorld([...comment("buyer", "buy this", 0.4)]);
    const { ctx } = makeCtx(app, params());
    await ctx.state.add("dm:self", "buyer");
    await profileAndDM(ctx, pageHazards("profile"), pageHazards("feed"));
    expect(ctx.stats.dmSent).toBe(0);
  });
});
