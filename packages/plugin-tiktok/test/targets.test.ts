import { describe, expect, it } from "vitest";
import { toRegistry } from "@auto/core";
import { activation, pageHazards, targets } from "../src/targets";

describe("targets 加载", () => {
  it("加载全部目标,可建成注册表(无重复)", () => {
    expect(targets.length).toBe(62);
    const r = toRegistry(targets);
    expect(r.get("nav.search-icon")?.kind).toBe("expected");
    expect(r.get("ad.shop-promo")?.hazardClass).toBe("overlay");
    expect(r.get("ad.shop-promo")?.handler).toBe("tapBox");
    // 新增:白色未互动目标 + 干净结果 + 广告视频
    expect(r.get("feed.like-off")?.kind).toBe("expected");
    expect(r.get("feed.save-off")?.kind).toBe("expected");
    expect(r.get("search.first-clean-result")?.kind).toBe("expected");
    expect(r.get("feed.ad-marker")?.handler).toBe("swipeAway");
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
    expect(feed).toContain("feed.live-tag"); // 页面专属
  });
});
