import { describe, expect, it } from "vitest";
import { interactWithVideo } from "../src/workflows/common";
import { defaultParams } from "../src/params";
import { FakeApp } from "./fake";
import { makeCtx } from "./helpers";

describe("interactWithVideo(视频级,识别是否已互动)", () => {
  it("白色未点赞/未收藏 + rng=0 → 点赞/收藏/关注都做,stats 计数", async () => {
    const app = new FakeApp().show("feed.like-off").show("feed.save-off").show("feed.follow");
    const { ctx } = makeCtx(app);
    await interactWithVideo(ctx, defaultParams.kwSearch);
    expect(app.taps).toEqual(["feed.like-off", "feed.save-off", "feed.follow"]);
    expect(ctx.stats).toMatchObject({ likes: 1, saves: 1, follows: 1 });
  });

  it("已点赞已收藏(无 -off 白色目标)→ 跳过不点、不计,避免取消赞/收藏", async () => {
    const app = new FakeApp().show("feed.follow"); // 红心/黄书签 → like-off/save-off 缺席
    const { ctx } = makeCtx(app);
    await interactWithVideo(ctx, defaultParams.kwSearch);
    expect(app.taps).toEqual(["feed.follow"]); // 只关注,没碰赞/藏
    expect(ctx.stats).toMatchObject({ likes: 0, saves: 0, follows: 1 });
  });

  it("已关注(无关注键)→ 跳过,不计 follows", async () => {
    const app = new FakeApp().show("feed.like-off").show("feed.save-off"); // 无 feed.follow
    const { ctx } = makeCtx(app);
    await interactWithVideo(ctx, defaultParams.kwSearch);
    expect(app.taps).toEqual(["feed.like-off", "feed.save-off"]);
    expect(ctx.stats.follows).toBe(0);
  });

  it("rng=1(概率都不命中)→ 什么都不做", async () => {
    const app = new FakeApp().show("feed.like-off").show("feed.save-off").show("feed.follow");
    const { ctx } = makeCtx(app, {}, () => 0.999999);
    await interactWithVideo(ctx, defaultParams.kwSearch);
    expect(app.taps).toEqual([]);
    expect(ctx.stats).toMatchObject({ likes: 0, saves: 0, follows: 0 });
  });
});
