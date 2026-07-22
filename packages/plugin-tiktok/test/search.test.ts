import { describe, expect, it } from "vitest";
import { searchWorkflow } from "../src/workflows/search";
import { tiktokPlugin } from "../src/index";
import { FakeApp } from "./fake";
import { makeCtx } from "./helpers";

/** 结果视频流:干净视频(白心白书签)。 */
function showCleanVideo(a: FakeApp): void {
  a.hide("search.results").hide("search.first-clean-result").hide("search.result-2");
  a.show("feed.rail").show("feed.like-off").show("feed.save-off");
}

/** 导航到结果页(放大镜→输入→提交)的公共转场。resultsShow 决定结果页显示哪些结果目标。 */
function navToResults(app: FakeApp, resultsShow: (a: FakeApp) => void): FakeApp {
  app.show("feed.rail").show("nav.search-icon");
  app
    .on("nav.search-icon", (a) => a.hide("feed.rail").hide("nav.search-icon").show("search.input"))
    .on("search.input", (a) => a.show("search.submit"))
    .on("search.submit", (a) => {
      a.hide("search.input").hide("search.submit").show("search.results");
      resultsShow(a);
    });
  return app;
}

describe("searchWorkflow", () => {
  it("无关键词 → 早退,不点任何东西", async () => {
    const app = new FakeApp().show("feed.rail");
    const { ctx } = makeCtx(app, { searchKeywords: [] });
    await searchWorkflow(ctx, 3);
    expect(app.taps).toEqual([]);
    expect(app.typed).toEqual([]);
  });

  it("优先点「首个非广告非直播结果」→ 遍历 N 条互动", async () => {
    const app = navToResults(new FakeApp(), (a) => a.show("search.first-clean-result").show("search.result-2"));
    app.on("search.first-clean-result", showCleanVideo);
    const { ctx } = makeCtx(app, { searchKeywords: ["beach"] });
    await searchWorkflow(ctx, 3);

    expect(app.taps).toEqual(expect.arrayContaining(["nav.search-icon", "search.submit", "search.first-clean-result"]));
    expect(app.taps).not.toContain("search.result-2"); // 有干净结果就不退回第二个
    expect(app.typed).toEqual(["beach"]);
    expect(ctx.stats.videosWatched).toBe(3);
    expect(app.taps.filter((t) => t === "feed.like-off")).toHaveLength(3);
    expect(app.swipes).toBe(3); // 提交后「下滑露结果」1 次 + 3 条结果间切换 2 次
  });

  it("VLM 找不到干净结果 → 退回点第二个(跳广告位)", async () => {
    const app = navToResults(new FakeApp(), (a) => a.show("search.result-2")); // 无 first-clean-result
    app.on("search.result-2", showCleanVideo);
    const { ctx } = makeCtx(app, { searchKeywords: ["beach"] });
    await searchWorkflow(ctx, 1);
    expect(app.taps).toContain("search.result-2");
    expect(ctx.stats.videosWatched).toBe(1);
  });

  it("进流兼验:结果是直播 → 跳过不互动", async () => {
    const app = navToResults(new FakeApp(), (a) => a.show("search.first-clean-result"));
    app.on("search.first-clean-result", (a) => {
      a.hide("search.results").hide("search.first-clean-result");
      a.show("feed.rail").show("feed.like-off").show("feed.live-tag"); // 直播卡
    });
    const { ctx } = makeCtx(app, { searchKeywords: ["beach"] });
    await searchWorkflow(ctx, 1);
    expect(ctx.stats.videosWatched).toBe(0); // 直播不计、不互动
    expect(app.taps).not.toContain("feed.like-off");
  });

  it("找不到搜索图标 → 优雅退出不抛错", async () => {
    const app = new FakeApp();
    const { ctx } = makeCtx(app, { searchKeywords: ["beach"] });
    await expect(searchWorkflow(ctx, 3)).resolves.toBeUndefined();
    expect(ctx.stats.videosWatched).toBe(0);
  });

  it("文案命中关注词 → 关注;不命中 → 不关注(posPrompts gate)", async () => {
    // 命中:文案含 cat
    const app1 = navToResults(new FakeApp(), (a) => a.show("search.first-clean-result"));
    app1.on("search.first-clean-result", (a) => {
      a.hide("search.results").hide("search.first-clean-result");
      a.show("feed.rail").show("feed.like-off").show("feed.follow");
      a.lines = [{ text: "a cute cat clip", box: [0.05, 0.75, 0.5, 0.77] }]; // 文案区
    });
    const { ctx: ctx1 } = makeCtx(app1, { searchKeywords: ["x"], posPrompts: ["cat"] });
    await searchWorkflow(ctx1, 1);
    expect(app1.taps).toContain("feed.follow");
    expect(ctx1.stats.follows).toBe(1);

    // 不命中:文案是 dog
    const app2 = navToResults(new FakeApp(), (a) => a.show("search.first-clean-result"));
    app2.on("search.first-clean-result", (a) => {
      a.hide("search.results").hide("search.first-clean-result");
      a.show("feed.rail").show("feed.like-off").show("feed.follow");
      a.lines = [{ text: "a happy dog clip", box: [0.05, 0.75, 0.5, 0.77] }];
    });
    const { ctx: ctx2 } = makeCtx(app2, { searchKeywords: ["x"], posPrompts: ["cat"] });
    await searchWorkflow(ctx2, 1);
    expect(app2.taps).not.toContain("feed.follow"); // 文案未命中 → 不关注
    expect(ctx2.stats.follows).toBe(0);
  });

  it("默认 posPrompts=['*'] → 不读文案、按概率关注(向后兼容)", async () => {
    const app = navToResults(new FakeApp(), (a) => a.show("search.first-clean-result"));
    app.on("search.first-clean-result", (a) => {
      a.hide("search.results").hide("search.first-clean-result");
      a.show("feed.rail").show("feed.like-off").show("feed.follow"); // 无 lines,不需读文案
    });
    const { ctx } = makeCtx(app, { searchKeywords: ["x"] }); // 默认 posPrompts ["*"]
    await searchWorkflow(ctx, 1);
    expect(ctx.stats.follows).toBe(1); // 纯概率(rng=0)→ 关注
  });

  it("评论区互动:门槛通过 + 有评论按钮 → 进评论区", async () => {
    const app = navToResults(new FakeApp(), (a) => a.show("search.first-clean-result"));
    app.on("search.first-clean-result", (a) => {
      a.hide("search.results").hide("search.first-clean-result");
      a.show("feed.rail").show("feed.like-off").show("feed.comment"); // 有评论按钮
    });
    app.on("feed.comment", (a) => a.show("comments.panel")); // 点评论 → 开面板
    const { ctx } = makeCtx(app, { searchKeywords: ["x"] }); // 默认 kwSearch interactEnable true,rng=0 过门槛
    await searchWorkflow(ctx, 1);
    expect(app.taps).toContain("feed.comment"); // 进了评论区
  });
});

describe("tiktokPlugin 装配", () => {
  it("结构完整,workflows.search 可执行,默认参数合法", () => {
    expect(tiktokPlugin.id).toBe("tiktok");
    expect(typeof tiktokPlugin.workflows.search).toBe("function");
    expect(() => tiktokPlugin.validateParams(tiktokPlugin.defaultParams)).not.toThrow();
  });
});
