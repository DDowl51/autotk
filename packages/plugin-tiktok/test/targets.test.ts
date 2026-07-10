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

  it("region 是 4 元组或省略", () => {
    for (const t of targets) {
      if (t.region) expect(t.region).toHaveLength(4);
    }
  });

  it("activation 结构完整 + pageHazards 合并 global∪page", () => {
    expect(activation.globalHazards).toContain("ad.shop-promo");
    expect(activation.pageExpected.feed).toContain("feed.rail");
    const feed = pageHazards("feed");
    expect(feed).toEqual(expect.arrayContaining(activation.globalHazards));
    expect(feed).toContain("feed.live-tag"); // 页面专属
  });
});
