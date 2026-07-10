import { describe, expect, it } from "vitest";
import { searchWorkflow } from "../src/workflows/search";
import { tiktokPlugin } from "../src/index";
import { FakeApp } from "./fake";
import { makeCtx } from "./helpers";

/** 组一个「会响应点击而转场」的搜索流程世界(每个要点的目标在对应步骤可见)。 */
function searchWorld(): FakeApp {
  const app = new FakeApp().show("feed.rail").show("nav.search-icon");
  app
    .on("nav.search-icon", (a) => a.hide("feed.rail").hide("nav.search-icon").show("search.input"))
    .on("search.input", (a) => a.show("search.submit")) // 聚焦输入框 → 出现提交
    .on("search.submit", (a) => a.hide("search.input").hide("search.submit").show("search.results").show("search.result-2"))
    .on("search.result-2", (a) => a.hide("search.results").hide("search.result-2").show("feed.rail").show("feed.like").show("feed.save"));
  // 结果视频流里盲滑 → 保持在视频流(rail/like 仍在)
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

  it("有关键词 → 走完导航 + 遍历 N 条结果互动", async () => {
    const app = searchWorld();
    const { ctx } = makeCtx(app, { searchKeywords: ["beach"] });
    await searchWorkflow(ctx, 3);

    // 导航链依序点了:放大镜 → 输入框(聚焦)→ 提交 → 第二个结果
    expect(app.taps).toEqual(expect.arrayContaining(["nav.search-icon", "search.input", "search.submit", "search.result-2"]));
    // 输入了关键词
    expect(app.typed).toEqual(["beach"]);
    // 遍历了 3 条结果(每条 videosWatched++)
    expect(ctx.stats.videosWatched).toBe(3);
    // 每条都点了赞(rng=0 → videoLikeProb 命中)
    expect(app.taps.filter((t) => t === "feed.like")).toHaveLength(3);
    // 3 条之间盲滑 2 次
    expect(app.swipes).toBe(2);
  });

  it("导航第一步就找不到搜索图标 → 升级链耗尽,不抛错(优雅退出)", async () => {
    const app = new FakeApp(); // 连 feed.rail 都没有 → 点放大镜的期望永不出现
    const { ctx } = makeCtx(app, { searchKeywords: ["beach"] });
    await expect(searchWorkflow(ctx, 3)).resolves.toBeUndefined();
    expect(ctx.stats.videosWatched).toBe(0);
  });
});

describe("tiktokPlugin 装配", () => {
  it("插件对象结构完整,workflows.search 可执行", async () => {
    expect(tiktokPlugin.id).toBe("tiktok");
    expect(tiktokPlugin.appId).toBe("com.zhiliaoapp.musically");
    expect(typeof tiktokPlugin.workflows.search).toBe("function");
    expect(() => tiktokPlugin.validateParams(tiktokPlugin.defaultParams)).not.toThrow();
  });
});
