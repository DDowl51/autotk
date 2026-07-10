import { describe, expect, it } from "vitest";
import { defaultParams, validateParams, type TikTokParams } from "../src/params";

const clone = (over: Partial<TikTokParams> = {}): TikTokParams => ({ ...structuredClone(defaultParams), ...over });

describe("validateParams", () => {
  it("默认参数合法", () => {
    expect(() => validateParams(defaultParams)).not.toThrow();
  });
  it("kwSearchExecRatio 越界 → 抛错", () => {
    expect(() => validateParams(clone({ kwSearchExecRatio: 1.5 }))).toThrow(/\[0,1\]/);
  });
  it("clickWaitTime<=0 → 抛错", () => {
    expect(() => validateParams(clone({ clickWaitTime: 0 }))).toThrow(/clickWaitTime/);
  });
  it("开了搜索但无关键词 → 抛错", () => {
    expect(() => validateParams(clone({ kwSearchExecRatio: 0.5, searchKeywords: [] }))).toThrow(/关键词/);
    expect(() => validateParams(clone({ kwSearchExecRatio: 0.5, searchKeywords: ["beach"] }))).not.toThrow();
  });
  it("评论互动上限过大 → 抛错(防封)", () => {
    const p = clone();
    p.kwSearch.commentLikeMaxCount = 999;
    expect(() => validateParams(p)).toThrow(/防封/);
  });
  it("模块概率越界 → 抛错", () => {
    const p = clone();
    p.forYou.videoLikeProb = 2;
    expect(() => validateParams(p)).toThrow(/videoLikeProb/);
  });
});

describe("defaultParams 防风控值", () => {
  it("是已降过的值(kwSearch 上限 5、forYou 4)", () => {
    expect(defaultParams.kwSearch.commentLikeMaxCount).toBe(5);
    expect(defaultParams.forYou.commentLikeMaxCount).toBe(4);
    expect(defaultParams.kwSearchExecRatio).toBe(0); // 开箱推荐页
  });
});
