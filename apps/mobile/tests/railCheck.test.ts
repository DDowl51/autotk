import test from "node:test";
import assert from "node:assert/strict";
import { validateRail, nearestProfileKey } from "../src/engine/railCheck";

const good = {
  like: { x: 359, y: 453 },
  comment: { x: 359, y: 520 },
  save: { x: 359, y: 585 },
  share: { x: 359, y: 654 },
};

test("validateRail：正常四点 → ok", () => {
  assert.equal(validateRail(good, 390, 844).ok, true);
});

test("validateRail：某点 x 不靠右缘 → 拒", () => {
  assert.equal(validateRail({ ...good, comment: { x: 100, y: 520 } }, 390, 844).ok, false);
});

test("validateRail：y 未递增 → 拒", () => {
  const bad = { like: { x: 359, y: 600 }, comment: { x: 359, y: 520 }, save: { x: 359, y: 585 }, share: { x: 359, y: 654 } };
  assert.equal(validateRail(bad, 390, 844).ok, false);
});

test("validateRail：间距悬殊（混入非动作图标）→ 拒", () => {
  const bad = { like: { x: 359, y: 453 }, comment: { x: 359, y: 460 }, save: { x: 359, y: 585 }, share: { x: 359, y: 654 } };
  assert.equal(validateRail(bad, 390, 844).ok, false);
});

test("nearestProfileKey：按宽高比+面积选最接近；空 → null", () => {
  assert.equal(nearestProfileKey(["375x667", "390x844", "430x932"], 393, 852), "390x844");
  assert.equal(nearestProfileKey(["375x667", "390x844"], 375, 667), "375x667");
  assert.equal(nearestProfileKey([], 390, 844), null);
});
