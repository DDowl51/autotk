import test from "node:test";
import assert from "node:assert/strict";
import { pickProfile } from "../src/engine/deviceSelect";
import type { DeviceProfile } from "../src/engine/onDeviceUI";

const mk = (w: number, h: number): DeviceProfile => ({ screen: { w, h } }) as DeviceProfile;
const profiles = { "390x844": mk(390, 844), "375x667": mk(375, 667) };

test("精确匹配分辨率", () => {
  assert.equal(pickProfile(profiles, 375, 667), profiles["375x667"]);
  assert.equal(pickProfile(profiles, 390, 844), profiles["390x844"]);
});

test("没有匹配 → undefined", () => {
  assert.equal(pickProfile(profiles, 1170, 2532), undefined);
});

test("宽高反了也能容错匹配", () => {
  assert.equal(pickProfile(profiles, 667, 375), profiles["375x667"]);
});
