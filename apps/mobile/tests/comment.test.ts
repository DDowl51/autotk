import test from "node:test";
import assert from "node:assert/strict";
import { parseComments, matchComment, isAdComment } from "../src/engine/commentParse";
import type { OcrBox } from "../src/vision/caption";

const box = (text: string, y: number): OcrBox => ({ text, x: 0.05, y, w: 0.3, h: 0.02 });

test("matchComment: 命中/不命中/空表", () => {
  assert.equal(matchComment("where can I buy this", ["where", "link"]), "where");
  assert.equal(matchComment("nice video", ["where", "link"]), null);
  assert.equal(matchComment("anything", []), null);
});

test("parseComments: 按 y 间距聚成多条，首行作者", () => {
  const boxes: OcrBox[] = [
    box("alice", 0.40), box("where can I get this", 0.43),
    box("bob", 0.55), box("love it", 0.58),
  ];
  const cs = parseComments(boxes);
  assert.equal(cs.length, 2, "应聚成 2 条: " + JSON.stringify(cs));
  assert.equal(cs[0].author, "alice");
  assert.match(cs[0].text, /where can I get this/);
  assert.equal(cs[1].author, "bob");
});

// —— IMG_0003：评论区置顶广告条（蓝字 CTA/推广标签），绝不能互动 ——
test("isAdComment: 置顶广告条（Learn more / Creator 推广）判为广告", () => {
  // 置顶（index 0）+ CTA「Learn more」→ 广告
  assert.equal(isAdComment({ author: "Orkin · Creator", text: "Learn more", y: 0.3 }, 0), true);
  // 明确标签「Sponsored」→ 任意位置都算广告
  assert.equal(isAdComment({ author: "brand", text: "Sponsored · get it now", y: 0.5 }, 5), true);
  assert.equal(isAdComment({ author: "商家", text: "赞助 立即购买", y: 0.5 }, 3), true);
});

test("isAdComment: 不误伤普通评论（“learn more”在正文深处/非置顶）", () => {
  // 普通评论正文里说 learn more，但不在置顶（index>1）→ 不算广告
  assert.equal(isAdComment({ author: "alice", text: "i want to learn more about this", y: 0.5 }, 4), false);
  // 置顶但只是普通夸赞 → 不算广告
  assert.equal(isAdComment({ author: "bob", text: "love it so much", y: 0.3 }, 0), false);
});

test("parseComments: 过滤区域外/空文字", () => {
  const boxes: OcrBox[] = [
    box("topbar", 0.05), // 顶部、区域外
    box("", 0.5), // 空文字
    box("carol", 0.5), box("hi there", 0.52),
  ];
  const cs = parseComments(boxes);
  assert.equal(cs.length, 1, JSON.stringify(cs));
  assert.equal(cs[0].author, "carol");
});
