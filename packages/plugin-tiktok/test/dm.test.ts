import { describe, expect, it } from "vitest";
import { dmCommenter } from "../src/workflows/dm";
import type { Comment } from "../src/comments";
import type { DmParams } from "../src/params";
import { FakeApp } from "./fake";
import { makeCtx } from "./helpers";

const cmt = (author: string, text = "buy this", isAd = false): Comment => ({ author, text, y: 0.4, isAd });
const DM: DmParams = { dmEnable: true, dmKeywords: ["buy"], dmTemplates: ["hi {user}"], dmDailyCap: 2 };

/** 组能发私信的世界:头像→主页(有私信按钮)→输入→发送。 */
function dmWorld(): FakeApp {
  const app = new FakeApp();
  app.dyn("profile avatar", [0.05, 0.4, 0.12, 0.42]);
  app.on("dyn:profile avatar", (a) => a.show("dm.message-button"));
  app.on("dm.message-button", (a) => a.show("dm.input"));
  app.on("dm.input", (a) => a.show("dm.send"));
  return app;
}

describe("dmCommenter", () => {
  it("正常发出 → sent,记去重 + 每日计数 + dmSent++", async () => {
    const app = dmWorld();
    const { ctx } = makeCtx(app, { dm: DM });
    const r = await dmCommenter(ctx, cmt("bob"), "self", DM);
    expect(r).toBe("sent");
    expect(ctx.stats.dmSent).toBe(1);
    expect(app.typed).toEqual(["hi bob"]); // 话术展开 {user}
    expect(await ctx.state.has("dm:self", "bob")).toBe(true);
    expect(await ctx.state.peekDaily("dm-count", "self")).toBe(1);
    expect(app.taps).toContain("dm.send");
  });

  it("已私信过 → skip-dedup,不进主页", async () => {
    const app = dmWorld();
    const { ctx } = makeCtx(app, { dm: DM });
    await ctx.state.add("dm:self", "bob");
    const r = await dmCommenter(ctx, cmt("bob"), "self", DM);
    expect(r).toBe("skip-dedup");
    expect(app.taps).toEqual([]); // 没点头像
  });

  it("到每日上限 → capped,不发", async () => {
    const app = dmWorld();
    const { ctx } = makeCtx(app, { dm: DM });
    await ctx.state.incrDaily("dm-count", "self");
    await ctx.state.incrDaily("dm-count", "self"); // 达到 cap=2
    const r = await dmCommenter(ctx, cmt("bob"), "self", DM);
    expect(r).toBe("capped");
    expect(ctx.stats.dmSent).toBe(0);
  });

  it("对方没私信按钮 → cant,记 dm-tried,不计数", async () => {
    const app = new FakeApp();
    app.dyn("profile avatar", [0.05, 0.4, 0.12, 0.42]); // 头像在,但主页无私信按钮
    const { ctx } = makeCtx(app, { dm: DM });
    const r = await dmCommenter(ctx, cmt("bob"), "self", DM);
    expect(r).toBe("cant");
    expect(ctx.stats.dmSent).toBe(0);
    expect(await ctx.state.has("dm-tried:self", "bob")).toBe(true);
    expect(await ctx.state.has("dm:self", "bob")).toBe(false); // 没记成已私信(下次条件满足可再试)
  });

  it("找不到头像 → no-avatar", async () => {
    const app = new FakeApp(); // 无 dyn 头像
    const { ctx } = makeCtx(app, { dm: DM });
    const r = await dmCommenter(ctx, cmt("bob"), "self", DM);
    expect(r).toBe("no-avatar");
  });
});
