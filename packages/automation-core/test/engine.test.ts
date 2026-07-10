import { describe, expect, it } from "vitest";
import { decide, runStep, tapTargetNow, type EngineDeps } from "../src/engine";
import { toRegistry, type Target } from "../src/target";
import type { Step } from "../src/step";
import { FakeWorld } from "./fake";

// —— 测试用目标表 ——
const TARGETS: Target[] = [
  { id: "feed.rail", phrase: "action rail", kind: "expected" },
  { id: "feed.like", phrase: "like button", kind: "expected" },
  { id: "search.input", phrase: "search box", kind: "expected" },
  { id: "sys.perm", phrase: "Don't Allow", kind: "hazard", hazardClass: "system", handler: "deny" },
  { id: "ad.popup", phrase: "close X", kind: "hazard", hazardClass: "overlay", handler: "tapBox" },
  { id: "feed.live", phrase: "LIVE badge", kind: "hazard", hazardClass: "category", handler: "swipeAway" },
  { id: "sheet.share", phrase: "share sheet", kind: "hazard", hazardClass: "overlay", handler: "back" },
  { id: "ad.comment", phrase: "ad comment", kind: "hazard", hazardClass: "category", handler: "skip" },
];

function mkDeps(w: FakeWorld): EngineDeps {
  return {
    driver: w.driver,
    perceptor: w.perceptor,
    targets: toRegistry(TARGETS),
    size: w.size,
    now: w.now,
    sleep: w.sleep,
    shouldStop: w.shouldStop,
    pollMs: 100,
  };
}

const step = (p: Partial<Step> & Pick<Step, "intent">): Step => ({
  expected: [],
  hazards: [],
  verify: [],
  timeout: 5000,
  onFail: [],
  ...p,
});

describe("decide", () => {
  it("期望在 → 执行 act → 验证成功 → ok(并在期望框中心点击)", async () => {
    const w = new FakeWorld().show("feed.like", [0.8, 0.4, 0.9, 0.5]).show("feed.rail");
    const s = step({ intent: "点赞", act: { kind: "tapTarget", target: "feed.like" }, expected: ["feed.like"], verify: ["feed.rail"] });
    const o = await decide(s, mkDeps(w));
    expect(o.status).toBe("ok");
    expect(w.taps).toHaveLength(1);
    // 框中心 (0.85,0.45) × (750,1334)
    expect(w.taps[0].x).toBeCloseTo(0.85 * 750, 6);
    expect(w.taps[0].y).toBeCloseTo(0.45 * 1334, 6);
  });

  it("期望不在 → 轮询 → 稍后出现 → ok", async () => {
    const w = new FakeWorld();
    w.at(250, () => w.show("search.input"));
    const s = step({ intent: "等搜索框", expected: ["search.input"], verify: ["search.input"] });
    const o = await decide(s, mkDeps(w));
    expect(o.status).toBe("ok");
    expect(w.clock).toBeGreaterThanOrEqual(250); // 确实轮询等待了
  });

  it("期望始终不在 → timeout", async () => {
    const w = new FakeWorld();
    const s = step({ intent: "等永不出现的", expected: ["search.input"], timeout: 1000 });
    const o = await decide(s, mkDeps(w));
    expect(o.status).toBe("timeout");
    expect(w.clock).toBeGreaterThanOrEqual(1000);
  });

  it("危险优先于期望:同屏都有 → 返回 hazard 并点危险框(不做 act)", async () => {
    const w = new FakeWorld().show("ad.popup", [0.9, 0.1, 0.95, 0.15]).show("feed.like");
    const s = step({ intent: "点赞", act: { kind: "tapTarget", target: "feed.like" }, expected: ["feed.like"], hazards: ["ad.popup"], verify: ["feed.rail"] });
    const o = await decide(s, mkDeps(w));
    expect(o.status).toBe("hazard");
    expect(o).toMatchObject({ id: "ad.popup" });
    expect(w.taps).toEqual([{ x: 0.925 * 750, y: 0.125 * 1334 }]); // 点的是危险框,不是 like
  });

  it("危险 class 优先级:system 先于 overlay", async () => {
    const w = new FakeWorld()
      .show("sys.perm", [0.5, 0.8, 0.6, 0.85])
      .show("ad.popup", [0.9, 0.1, 0.95, 0.15]);
    const s = step({ intent: "step", expected: ["feed.rail"], hazards: ["ad.popup", "sys.perm"] });
    const o = await decide(s, mkDeps(w));
    expect(o).toMatchObject({ status: "hazard", id: "sys.perm" });
  });

  it("category 直播卡 swipeAway:盲滑而非点击", async () => {
    const w = new FakeWorld().show("feed.live").show("feed.rail");
    const s = step({ intent: "step", expected: ["feed.rail"], hazards: ["feed.live"] });
    const o = await decide(s, mkDeps(w));
    expect(o).toMatchObject({ status: "hazard", id: "feed.live" });
    expect(w.taps).toHaveLength(0);
    expect(w.swipes).toHaveLength(1);
    expect(w.swipes[0].from.y).toBeGreaterThan(w.swipes[0].to.y); // 向上滑
  });

  it("act 后 verify 目标不出现 → timeout", async () => {
    const w = new FakeWorld().show("search.input");
    const s = step({ intent: "点搜索", act: { kind: "tapTarget", target: "search.input" }, expected: ["search.input"], verify: ["feed.rail"], timeout: 800 });
    const o = await decide(s, mkDeps(w));
    expect(o.status).toBe("timeout");
  });

  it("停止请求 → stopped", async () => {
    const w = new FakeWorld();
    w.stop = true;
    const o = await decide(step({ intent: "x", expected: ["feed.rail"] }), mkDeps(w));
    expect(o.status).toBe("stopped");
  });

  it("纯动作步(无 verify)执行 act 即成功", async () => {
    const w = new FakeWorld().show("feed.rail");
    const s = step({ intent: "盲滑", act: { kind: "swipeNext" }, expected: ["feed.rail"], verify: [] });
    const o = await decide(s, mkDeps(w));
    expect(o.status).toBe("ok");
    expect(w.swipes).toHaveLength(1);
  });
});

describe("runStep 升级链", () => {
  it("超时 + onFail=[alertOperator] → alert(不盲动)", async () => {
    const w = new FakeWorld();
    const s = step({ intent: "关搜索", expected: ["search.input"], timeout: 500, onFail: [{ kind: "alertOperator", message: "关不掉" }] });
    const r = await runStep(s, mkDeps(w));
    expect(r).toEqual({ status: "alert", message: "关不掉" });
  });

  it("onFail 空 → 默认 alert", async () => {
    const w = new FakeWorld();
    const r = await runStep(step({ intent: "X", expected: ["search.input"], timeout: 300 }), mkDeps(w));
    expect(r.status).toBe("alert");
  });

  it("retry:头几次超时,后来期望出现 → ok", async () => {
    const w = new FakeWorld();
    w.at(1200, () => w.show("search.input")); // 单次 timeout=500,得靠 retry 熬到 1200
    const s = step({ intent: "等", expected: ["search.input"], verify: ["search.input"], timeout: 500, onFail: [{ kind: "retry", times: 5 }] });
    const r = await runStep(s, mkDeps(w));
    expect(r.status).toBe("ok");
  });

  it("variants:第一个动作变体验证失败,第二个成功 → ok", async () => {
    const w = new FakeWorld().show("feed.rail");
    // 前 2 次上滑不出 verify,第 3 次(即第二个变体)后出现
    w.onSwipe = (_f, _t, world) => {
      if (world.swipes.length >= 2) world.show("feed.like");
    };
    const s = step({
      intent: "换位置上滑",
      act: { kind: "swipe", from: { x: 0, y: 0 }, to: { x: 0, y: 0 } },
      expected: ["feed.rail"],
      verify: ["feed.like"],
      timeout: 400,
      onFail: [{ kind: "variants", ops: [{ kind: "swipeNext" }, { kind: "swipeNext" }] }, { kind: "alertOperator", message: "划不动" }],
    });
    const r = await runStep(s, mkDeps(w));
    expect(r.status).toBe("ok");
  });

  it("recover:超时 + onFail=[recover] → 交上层回基地", async () => {
    const w = new FakeWorld();
    const s = step({ intent: "x", expected: ["search.input"], timeout: 300, onFail: [{ kind: "recover" }] });
    const r = await runStep(s, mkDeps(w));
    expect(r.status).toBe("recover");
  });

  it("危险处理后重跑本步 → ok", async () => {
    const w = new FakeWorld().show("ad.popup", [0.9, 0.1, 0.95, 0.15]);
    // 点掉广告(点在其框附近)→ 广告消失、期望+验证出现
    w.onTap = (_p, world) => {
      world.hide("ad.popup").show("feed.like").show("feed.rail");
    };
    const s = step({ intent: "点赞", act: { kind: "tapTarget", target: "feed.like" }, expected: ["feed.like"], hazards: ["ad.popup"], verify: ["feed.rail"], timeout: 1000 });
    const r = await runStep(s, mkDeps(w));
    expect(r.status).toBe("ok");
  });

  it("危险反复出现关不掉 → 熔断 alert", async () => {
    const w = new FakeWorld().show("ad.popup", [0.9, 0.1, 0.95, 0.15]); // 点了也不消失
    const s = step({ intent: "点赞", expected: ["feed.like"], hazards: ["ad.popup"], timeout: 500 });
    const r = await runStep(s, mkDeps(w));
    expect(r.status).toBe("alert");
    expect(r).toMatchObject({ message: expect.stringContaining("危险反复出现") });
  });
});

describe("handler 分支", () => {
  it("deny:点定位到的框(等同 tapBox)", async () => {
    const w = new FakeWorld().show("sys.perm", [0.4, 0.8, 0.6, 0.85]).show("feed.rail");
    const o = await decide(step({ intent: "x", expected: ["feed.rail"], hazards: ["sys.perm"] }), mkDeps(w));
    expect(o).toMatchObject({ status: "hazard", id: "sys.perm" });
    expect(w.taps).toEqual([{ x: 0.5 * 750, y: 0.825 * 1334 }]);
    expect(w.swipes).toHaveLength(0);
  });

  it("back:左→右返回手势(不点击)", async () => {
    const w = new FakeWorld().show("sheet.share").show("feed.rail");
    const o = await decide(step({ intent: "x", expected: ["feed.rail"], hazards: ["sheet.share"] }), mkDeps(w));
    expect(o).toMatchObject({ status: "hazard", id: "sheet.share" });
    expect(w.taps).toHaveLength(0);
    expect(w.swipes).toHaveLength(1);
    expect(w.swipes[0].from.x).toBeLessThan(w.swipes[0].to.x); // 左边缘 → 右
  });

  it("skip:识别到但不做任何触控(交插件层)", async () => {
    const w = new FakeWorld().show("ad.comment").show("feed.rail");
    const o = await decide(step({ intent: "x", expected: ["feed.rail"], hazards: ["ad.comment"] }), mkDeps(w));
    expect(o).toMatchObject({ status: "hazard", id: "ad.comment" });
    expect(w.taps).toHaveLength(0);
    expect(w.swipes).toHaveLength(0);
  });
});

describe("act 分支", () => {
  it("typeInto:先点输入框再打字", async () => {
    const w = new FakeWorld().show("search.input", [0.1, 0.02, 0.7, 0.08]);
    const s = step({ intent: "输入", act: { kind: "typeInto", target: "search.input", text: "beach" }, expected: ["search.input"], verify: [] });
    const o = await decide(s, mkDeps(w));
    expect(o.status).toBe("ok");
    expect(w.taps).toHaveLength(1); // 聚焦输入框
    expect(w.typed).toEqual(["beach"]);
  });

  it("tapPoint:点固定像素点", async () => {
    const w = new FakeWorld().show("feed.rail");
    const s = step({ intent: "点固定点", act: { kind: "tapPoint", point: { x: 100, y: 200 } }, expected: ["feed.rail"], verify: [] });
    await decide(s, mkDeps(w));
    expect(w.taps).toEqual([{ x: 100, y: 200 }]);
  });

  it("tapTarget 要点的目标未出现 → 当加载中轮询,始终不现则 timeout(不盲点)", async () => {
    const w = new FakeWorld().show("feed.rail"); // 有 rail(期望)但没 feed.like
    const s = step({ intent: "点赞", act: { kind: "tapTarget", target: "feed.like" }, expected: ["feed.rail"], verify: [], timeout: 800 });
    const o = await decide(s, mkDeps(w));
    expect(o.status).toBe("timeout");
    expect(w.taps).toHaveLength(0); // 没盲点
  });

  it("tapTarget 目标稍后出现 → 轮询到后执行 → ok", async () => {
    const w = new FakeWorld().show("feed.rail");
    w.at(200, () => w.show("feed.like", [0.8, 0.4, 0.9, 0.5]));
    const s = step({ intent: "点赞", act: { kind: "tapTarget", target: "feed.like" }, expected: ["feed.rail"], verify: [], timeout: 2000 });
    const o = await decide(s, mkDeps(w));
    expect(o.status).toBe("ok");
    expect(w.taps).toHaveLength(1);
  });
});

describe("tapTargetNow(L1 复用封装)", () => {
  it("定位到 → 点其中心并返回像素点", async () => {
    const w = new FakeWorld().show("feed.like", [0.8, 0.4, 0.9, 0.5]);
    const p = await tapTargetNow(mkDeps(w), "feed.like");
    expect(p).not.toBeNull();
    expect(w.taps).toHaveLength(1);
    expect(p!.x).toBeCloseTo(0.85 * 750, 6);
  });
  it("没定位到 → 返回 null,不点击", async () => {
    const w = new FakeWorld();
    const p = await tapTargetNow(mkDeps(w), "feed.like");
    expect(p).toBeNull();
    expect(w.taps).toHaveLength(0);
  });
});

describe("错误路径", () => {
  it("Step 引用未知 Target id → 抛错", async () => {
    const w = new FakeWorld();
    await expect(decide(step({ intent: "x", expected: ["nope.unknown"] }), mkDeps(w))).rejects.toThrow(/未知 Target/);
  });
});
