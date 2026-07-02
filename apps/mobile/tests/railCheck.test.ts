import test from "node:test";
import assert from "node:assert/strict";
import { validateRail, nearestProfileKey, railOffsetY } from "../src/engine/railCheck";

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

const storedYs = [453, 520, 585, 654]; // 标定时的赞/评/藏/享 y

test("railOffsetY：整条右栏下移 +20 → 估出约 +20", () => {
  const detected = storedYs.map((y) => y + 20);
  assert.equal(railOffsetY(storedYs, detected), 20);
});

test("railOffsetY：点赞变红少一个白带（只剩 3 个）仍能估出偏移", () => {
  const detected = [520, 585, 654].map((y) => y - 15); // 缺 like 带、整体上移 15
  assert.equal(railOffsetY(storedYs, detected), -15);
});

test("railOffsetY：对不上的带（<2 个匹配）→ null（不敢调）", () => {
  assert.equal(railOffsetY(storedYs, [100]), null); // 只 1 个、且离所有标定带都远
  assert.equal(railOffsetY(storedYs, []), null);
  assert.equal(railOffsetY([], [453]), null);
});

test("railOffsetY：偏移超过 maxShift 的带被忽略", () => {
  // 两个正常(+10) + 一个离谱(+500，被 maxShift 滤掉) → 仍取 +10
  const detected = [453 + 10, 520 + 10, 585 + 500];
  assert.equal(railOffsetY(storedYs, detected), 10);
});
