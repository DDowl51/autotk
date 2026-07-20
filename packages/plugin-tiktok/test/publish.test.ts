import { describe, expect, it } from "vitest";
import { publish } from "../src/workflows/publish";
import { pageHazards } from "../src/targets";
import { FakeApp } from "./fake";
import { makeCtx } from "./helpers";

/** 组一个能一路走通发布的世界(基地:推荐流可见 + 底部 [+])。 */
function publishWorld(): FakeApp {
  const app = new FakeApp().show("feed.rail").show("publish.plus"); // 基地:发布前 recover 探到 feed.rail
  app
    .on("publish.plus", (a) => a.show("publish.upload"))
    .on("publish.upload", (a) => a.hide("publish.upload").show("publish.album-first"))
    .on("publish.album-first", (a) => a.hide("publish.album-first").show("publish.next"))
    .on("publish.next", (a) => a.hide("publish.next").show("publish.caption"))
    .on("publish.caption", (a) => a.show("publish.post")) // 聚焦文案框 → 出现发布按钮
    .on("publish.post", (a) => a.hide("publish.post").show("feed.rail")); // 发布 → 回信息流
  return app;
}

describe("publish", () => {
  it("一路走通 → published,输入文案,依序点 +→上传→选片→下一步→发布", async () => {
    const app = publishWorld();
    const { ctx } = makeCtx(app, {});
    const r = await publish(ctx, { caption: "美好的一天 #beach" }, pageHazards("publish"), pageHazards("feed"));
    expect(r).toBe("published");
    expect(app.typed).toEqual(["美好的一天 #beach"]);
    expect(app.taps).toEqual(["publish.plus", "publish.upload", "publish.album-first", "publish.next", "publish.caption", "publish.post"]);
  });

  it("某步验证目标始终不出现 → failed(不误报成功)", async () => {
    const app = new FakeApp().show("feed.rail").show("publish.plus"); // 基地 OK,但点+后 upload 不出现
    const { ctx } = makeCtx(app, {});
    const r = await publish(ctx, { caption: "x" }, pageHazards("publish"), pageHazards("feed"));
    expect(r).toBe("failed");
  });

  it("回基地失败(既非推荐流也退不出)→ failed,不进发布流", async () => {
    const app = new FakeApp(); // 无 feed.rail、无 publish.plus、退不出
    const { ctx } = makeCtx(app, {});
    const r = await publish(ctx, { caption: "x" }, pageHazards("publish"), pageHazards("feed"));
    expect(r).toBe("failed");
    expect(app.taps).toEqual([]); // 没点 publish.plus(recover 就失败了)
  });

  it("权限窗(相机)挡路 → allow 处理后继续", async () => {
    const app = publishWorld();
    // 点上传后先弹相机权限(sys.camera-perm,handler=allow),点掉后再出相册
    app.on("publish.upload", (a) => a.hide("publish.upload").show("sys.camera-perm"));
    app.on("sys.camera-perm", (a) => a.hide("sys.camera-perm").show("publish.album-first"));
    const { ctx } = makeCtx(app, {});
    const r = await publish(ctx, { caption: "y" }, pageHazards("publish"), pageHazards("feed"));
    expect(r).toBe("published");
    expect(app.taps).toContain("sys.camera-perm"); // 权限被 allow 点掉
  });
});
