import test from "node:test";
import assert from "node:assert/strict";
import { parseComments, matchComment } from "../src/engine/commentParse";
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
