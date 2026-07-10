import { describe, expect, it } from "vitest";
import { scrollComments } from "../src/workflows/comments";
import { FakeApp, cline } from "./fake";
import { makeCtx } from "./helpers";

describe("scrollComments", () => {
  it("下滑加载更多 → 跨屏去重 → 连续两屏无新即到底", async () => {
    // 每屏可见评论(y 在评论区内,间距>ROW_GAP 各自成条)。
    const screens = [
      [cline("a1", 0.4), cline("a2", 0.5)],
      [cline("a2", 0.4), cline("a3", 0.5)], // a2 重复,a3 新
      [cline("a3", 0.4), cline("a4", 0.5)], // a4 新
      [cline("a4", 0.4)], // 无新
      [cline("a4", 0.4)], // 无新(第二屏)→ 到底
    ];
    const app = new FakeApp();
    let idx = 0;
    app.lines = screens[0];
    app.onSwipe = (a) => {
      idx = Math.min(idx + 1, screens.length - 1);
      a.lines = screens[idx];
    };
    const { ctx } = makeCtx(app);
    const comments = await scrollComments(ctx, 10);

    expect(comments.map((c) => c.author)).toEqual(["a1", "a2", "a3", "a4"]); // 去重且有序
    expect(app.swipes).toBeLessThan(10); // 到底提前停,没滑满 10 次
  });

  it("空评论区 → 返回空,很快到底", async () => {
    const app = new FakeApp();
    app.lines = [];
    const { ctx } = makeCtx(app);
    const comments = await scrollComments(ctx, 10);
    expect(comments).toEqual([]);
    expect(app.swipes).toBeLessThanOrEqual(2);
  });

  it("maxScrolls 兜底:一直有新评论也不会无限滚", async () => {
    const app = new FakeApp();
    let n = 0;
    app.lines = [cline("u0", 0.4)];
    app.onSwipe = (a) => {
      n++;
      a.lines = [cline(`u${n}`, 0.4)]; // 每屏都是新评论
    };
    const { ctx } = makeCtx(app);
    await scrollComments(ctx, 3);
    expect(app.swipes).toBe(3); // 到上限即停
  });
});
