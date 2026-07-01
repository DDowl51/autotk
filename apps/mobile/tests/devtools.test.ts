import test from "node:test";
import assert from "node:assert/strict";
import { isDeveloperMode } from "../src/app/devtools";

test("dev 构建 → 开", () => {
  assert.equal(isDeveloperMode(true, undefined), true);
  assert.equal(isDeveloperMode(true, "0"), true);
});

test("发行版默认关；EXPO_PUBLIC_DEV_TOOLS=1 才开", () => {
  assert.equal(isDeveloperMode(false, undefined), false);
  assert.equal(isDeveloperMode(false, "0"), false);
  assert.equal(isDeveloperMode(false, ""), false);
  assert.equal(isDeveloperMode(false, "1"), true);
});
