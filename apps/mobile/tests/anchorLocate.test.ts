import test from "node:test";
import assert from "node:assert/strict";
import { findAnchorByText } from "../src/engine/anchorLocate";
import type { OcrBox } from "../src/vision/caption";

const box = (text: string, x: number, y: number, w = 0.1, h = 0.03): OcrBox => ({ text, x, y, w, h });

test("findAnchorByText：精确命中 → 返回像素中心", () => {
  const boxes = [box("推荐", 0.5, 0.06), box("关注", 0.38, 0.06)];
  const p = findAnchorByText(boxes, ["关注"], 390, 844);
  assert.ok(p);
  assert.equal(Math.round(p!.x), Math.round((0.38 + 0.05) * 390));
  assert.equal(Math.round(p!.y), Math.round((0.06 + 0.015) * 844));
});

test("findAnchorByText：正则命中（中英文任一）", () => {
  const p = findAnchorByText([box("Following", 0.3, 0.06)], [/^(关注|Following)$/], 390, 844);
  assert.ok(p);
});

test("findAnchorByText：优先精确、包含兜底（评论里含同字不误取）", () => {
  const boxes = [box("我关注你了", 0.2, 0.5), box("关注", 0.38, 0.06)];
  const p = findAnchorByText(boxes, ["关注"], 390, 844);
  assert.ok(p);
  assert.equal(Math.round(p!.y), Math.round((0.06 + 0.015) * 844)); // 取顶部 tab，非评论
});

test("findAnchorByText：找不到 → null", () => {
  assert.equal(findAnchorByText([box("推荐", 0.5, 0.06)], ["关注"], 390, 844), null);
});
