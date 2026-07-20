import { describe, expect, it } from "vitest";
import { recoverToFeed } from "../src/workflows/recover";
import { FakeApp } from "./fake";
import { makeCtx } from "./helpers";

const isDown = (s: { from: { y: number }; to: { y: number } }) => s.to.y > s.from.y;
const isRight = (s: { from: { x: number }; to: { x: number } }) => s.to.x > s.from.x;

describe("recoverToFeed 多策略脱困", () => {
  it("已在推荐流 → true,不滑", async () => {
    const app = new FakeApp();
    app.show("feed.rail");
    const { ctx } = makeCtx(app);
    expect(await recoverToFeed(ctx)).toBe(true);
    expect(app.swipes).toBe(0);
  });

  it("评论面板开着(浮层)→ 竖直下滑关 → 回推荐流", async () => {
    const app = new FakeApp();
    app.show("comments.panel");
    app.onSwipe = (a) => {
      if (a.lastSwipe && isDown(a.lastSwipe)) {
        a.hide("comments.panel");
        a.show("feed.rail"); // 下滑关掉面板 → 露出推荐流
      }
    };
    const { ctx } = makeCtx(app);
    expect(await recoverToFeed(ctx)).toBe(true);
    expect(isDown(app.lastSwipe!)).toBe(true); // 用的是竖直下滑,不是右滑
  });

  it("pushed 页(无 feed.rail 无面板)→ 边缘右滑退 → 回推荐流", async () => {
    const app = new FakeApp(); // 空:既无 feed.rail 也无 comments.panel
    app.onSwipe = (a) => {
      a.show("feed.rail"); // 退一级到推荐流
    };
    const { ctx } = makeCtx(app);
    expect(await recoverToFeed(ctx)).toBe(true);
    expect(isRight(app.lastSwipe!)).toBe(true); // 边缘右滑
  });

  it("先关面板再退一级(面板 → pushed → feed)混合脱困", async () => {
    const app = new FakeApp();
    app.show("comments.panel");
    let phase = 0;
    app.onSwipe = (a) => {
      if (phase === 0 && a.lastSwipe && isDown(a.lastSwipe)) {
        a.hide("comments.panel"); // 第一步:下滑关面板,但还在 pushed 页(无 feed.rail)
        phase = 1;
      } else if (phase === 1 && a.lastSwipe && isRight(a.lastSwipe)) {
        a.show("feed.rail"); // 第二步:右滑退到推荐流
      }
    };
    const { ctx } = makeCtx(app);
    expect(await recoverToFeed(ctx)).toBe(true);
    expect(app.swipes).toBe(2);
  });

  it("退不回(始终无 feed.rail)→ false,用尽 maxSteps", async () => {
    const app = new FakeApp();
    const { ctx } = makeCtx(app);
    expect(await recoverToFeed(ctx, 3)).toBe(false);
    expect(app.swipes).toBe(3);
  });

  it("中途 stop → false", async () => {
    const app = new FakeApp();
    app.stop = true;
    const { ctx } = makeCtx(app);
    expect(await recoverToFeed(ctx)).toBe(false);
  });
});
