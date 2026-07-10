import { describe, expect, it } from "vitest";
import { interactWithVideo } from "../src/workflows/common";
import { defaultParams } from "../src/params";
import { FakeApp } from "./fake";
import { makeCtx } from "./helpers";

describe("interactWithVideo(视频级)", () => {
  it("rng=0(所有正概率触发)→ 点赞/收藏/关注都做,stats 计数", async () => {
    const app = new FakeApp().show("feed.like").show("feed.save").show("feed.follow");
    const { ctx } = makeCtx(app);
    await interactWithVideo(ctx, defaultParams.kwSearch);
    expect(app.taps).toEqual(["feed.like", "feed.save", "feed.follow"]);
    expect(ctx.stats).toMatchObject({ likes: 1, saves: 1, follows: 1 });
  });

  it("已关注(无关注键)→ tapTarget 落空,不计 follows", async () => {
    const app = new FakeApp().show("feed.like").show("feed.save"); // 无 feed.follow
    const { ctx } = makeCtx(app);
    await interactWithVideo(ctx, defaultParams.kwSearch);
    expect(app.taps).toEqual(["feed.like", "feed.save"]);
    expect(ctx.stats.follows).toBe(0);
  });

  it("rng=1(概率都不命中)→ 什么都不做", async () => {
    const app = new FakeApp().show("feed.like").show("feed.save").show("feed.follow");
    const { ctx } = makeCtx(app, {}, () => 0.999999);
    await interactWithVideo(ctx, defaultParams.kwSearch);
    expect(app.taps).toEqual([]);
    expect(ctx.stats).toMatchObject({ likes: 0, saves: 0, follows: 0 });
  });
});
