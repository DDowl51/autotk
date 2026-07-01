import test from "node:test";
import assert from "node:assert/strict";
import { computeAnchors, resolveAnchor } from "../src/engine/anchors";

test("computeAnchors 在 390x844 复现既有占位坐标", () => {
  const a = computeAnchors(390, 844);
  assert.equal(Math.round(a.followTab.x), Math.round(390 * 0.38));
  assert.equal(Math.round(a.followTab.y), Math.round(844 * 0.065));
  assert.equal(Math.round(a.searchIcon.x), 390 - 28); // (390-28)/390 * 390
  assert.equal(Math.round(a.profileTab.x), Math.round(390 * 0.9));
});

test("computeAnchors 随屏幕尺寸缩放", () => {
  const a = computeAnchors(780, 1688);
  assert.equal(a.followTab.x, 780 * 0.38);
  assert.equal(a.followTab.y, 1688 * 0.065);
});

test("resolveAnchor 优先用档案覆盖值，未覆盖用比例默认", () => {
  const p = { anchors: { followTab: { x: 11, y: 22 } } };
  assert.deepEqual(resolveAnchor(p, 390, 844, "followTab"), { x: 11, y: 22 });
  assert.equal(resolveAnchor(p, 390, 844, "profileTab").x, 390 * 0.9);
  // 空档案 → 全用默认
  assert.equal(resolveAnchor({}, 390, 844, "backArrow").x, 390 * 0.06);
});
