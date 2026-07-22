import { describe, expect, it } from "vitest";
import { toRegistry } from "@auto/core";
import { activation, pageHazards, targets } from "../src/targets";

describe("targets 加载", () => {
  it("加载全部目标,可建成注册表(无重复)", () => {
    expect(targets.length).toBe(65);
    const r = toRegistry(targets);
    expect(r.get("nav.search-icon")?.kind).toBe("expected");
    expect(r.get("ad.shop-promo")?.hazardClass).toBe("overlay");
    expect(r.get("ad.shop-promo")?.handler).toBe("tapBox");
    // 白色未互动目标 + 干净结果 + 广告视频
    expect(r.get("feed.like-off")?.kind).toBe("expected");
    expect(r.get("feed.save-off")?.kind).toBe("expected");
    expect(r.get("search.first-clean-result")?.kind).toBe("expected");
    expect(r.get("feed.ad-marker")?.handler).toBe("swipeAway");
    // 通用危险(× / Not now / Not interested)+ 通用拒绝 + 发布确认
    expect(r.get("sys.perm-deny")?.handler).toBe("deny");
    expect(r.get("popup.generic-close")?.handler).toBe("tapBox");
    expect(r.get("popup.not-now")?.kind).toBe("hazard");
    expect(r.get("popup.not-interested")?.kind).toBe("hazard");
    expect(r.get("publish.post-confirm")?.hazardClass).toBe("overlay");
    // 旧的按类型拒绝项已并入通用 sys.perm-deny
    expect(r.get("sys.location-perm")).toBeUndefined();
    expect(r.get("sys.notif-perm")).toBeUndefined();
  });

  it("region 加载时由 [x,y,w,h] 换算成角点 Box,且全注册表合法(x1<x2≤1, y1<y2≤1)", () => {
    let withRegion = 0;
    for (const t of targets) {
      if (!t.region) continue;
      withRegion++;
      const [x1, y1, x2, y2] = t.region;
      expect(x1, t.id).toBeGreaterThanOrEqual(0);
      expect(y1, t.id).toBeGreaterThanOrEqual(0);
      expect(x2, t.id).toBeGreaterThan(x1); // 角点框,绝非 [x,y,w,h] 原样透传
      expect(y2, t.id).toBeGreaterThan(y1);
      expect(x2, t.id).toBeLessThanOrEqual(1);
      expect(y2, t.id).toBeLessThanOrEqual(1);
    }
    expect(withRegion).toBeGreaterThan(30); // 注册表 36 个带 region,防字段静默丢失
    // 抽查换算:feed.like 注册表 [0.82,0.4,0.18,0.2] → [0.82,0.4,1.0,0.6]
    const like = targets.find((t) => t.id === "feed.like")!.region!;
    expect(like[0]).toBeCloseTo(0.82);
    expect(like[2]).toBeCloseTo(1.0);
    expect(like[3]).toBeCloseTo(0.6);
  });

  it("activation 结构完整 + pageHazards 合并 global∪page", () => {
    expect(activation.globalHazards).toContain("ad.shop-promo");
    expect(activation.pageExpected.feed).toContain("feed.rail");
    const feed = pageHazards("feed");
    expect(feed).toEqual(expect.arrayContaining(activation.globalHazards));
    expect(feed).toContain("popup.notif-friend"); // 页面专属(模态弹窗,特征词 specific)
  });

  it("内容类标记(直播/广告)不进每轮危险网:全屏 OCR 一次检测下会被字幕误伤,交工作流逻辑显式处理", () => {
    // feed.live-tag / feed.ad-marker(swipeAway)由 following.ts / search.ts 用 ctx.locate 显式判;
    // comment.ad-first 由 comments.ts 经 c.isAd 判。留在 pageHazards 里会被 "LIVE"/"广告" 字幕触发误滑。
    const feed = pageHazards("feed");
    expect(feed).not.toContain("feed.live-tag");
    expect(feed).not.toContain("feed.ad-marker");
    expect(pageHazards("comments")).not.toContain("comment.ad-first");
    // 但目标定义仍在(供工作流显式 locate)
    expect(targets.find((t) => t.id === "feed.live-tag")?.handler).toBe("swipeAway");
  });
});
