import { describe, expect, it } from "vitest";
import type { TextLine } from "@auto/core";
import { commentKey, isAdComment, matchComment, parseComments } from "../src/comments";
import { expandPlaceholders, genReply } from "../src/gen";

const line = (text: string, y: number, x = 0.05): TextLine => ({ text, box: [x, y, x + 0.3, y + 0.02] });

describe("parseComments", () => {
  it("按 y 间距聚成多条,首行作者", () => {
    const cs = parseComments([line("alice", 0.4), line("where can I get this", 0.43), line("bob", 0.55), line("love it", 0.58)]);
    expect(cs).toHaveLength(2);
    expect(cs[0].author).toBe("alice");
    expect(cs[0].text).toMatch(/where can I get this/);
    expect(cs[1].author).toBe("bob");
  });
  it("过滤区域外/空文字", () => {
    const cs = parseComments([line("topbar", 0.05), line("", 0.5), line("carol", 0.5), line("hi", 0.52)]);
    expect(cs).toHaveLength(1);
    expect(cs[0].author).toBe("carol");
  });
});

describe("isAdComment", () => {
  it("置顶 CTA(Learn more)/明确标签 → 广告", () => {
    expect(isAdComment("Orkin · Creator", "Learn more", 0)).toBe(true);
    expect(isAdComment("brand", "Sponsored get it", 5)).toBe(true);
    expect(isAdComment("商家", "赞助 立即购买", 3)).toBe(true);
  });
  it("不误伤:learn more 在非置顶普通评论 / 置顶普通夸赞", () => {
    expect(isAdComment("alice", "i want to learn more about this", 4)).toBe(false);
    expect(isAdComment("bob", "love it", 0)).toBe(false);
  });
  it("parseComments 顺带标 isAd(首条 Learn more)", () => {
    const cs = parseComments([line("Orkin", 0.3), line("Learn more", 0.32), line("bob", 0.5), line("nice", 0.52)]);
    expect(cs[0].isAd).toBe(true);
    expect(cs[1].isAd).toBe(false);
  });
});

describe("matchComment", () => {
  it("命中返回原词 / 不命中 null / 空表 null", () => {
    expect(matchComment("where can I buy this", ["Where", "link"])).toBe("Where");
    expect(matchComment("nice video", ["where"])).toBeNull();
    expect(matchComment("anything", [])).toBeNull();
  });
});

describe("commentKey", () => {
  const key = (author: string, text: string) => commentKey({ author, text, y: 0, isAd: false });
  it("空白归一化:同文不同空白 → 同键", () => {
    expect(key("bob", "hi  there")).toBe(key("bob", "hi there"));
  });
  it("不同评论 → 不同键", () => {
    expect(key("alice", "a")).not.toBe(key("bob", "b"));
  });
});

describe("话术生成", () => {
  const seq = (vals: number[]) => {
    let i = 0;
    return () => vals[i++ % vals.length];
  };
  it("{a|b|c} 竖线择一 + {user}/{kw} 变量 + 归一化空格", () => {
    const out = expandPlaceholders("{love this|so true} {user} {kw}", { user: "@bob", keyword: "buy" }, seq([0]));
    expect(out).toBe("love this @bob buy");
  });
  it("{emoji} 展开为表情", () => {
    const out = expandPlaceholders("nice {emoji}", {}, seq([0]));
    expect(out).toBe("nice 😍");
  });
  it("空模板列表 → 空串(不发)", () => {
    expect(genReply([], {}, seq([0]))).toBe("");
  });
  it("genReply 取模板并展开", () => {
    expect(genReply(["hi {kw}"], { keyword: "beach" }, seq([0]))).toBe("hi beach");
  });
});
