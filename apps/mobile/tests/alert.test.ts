import test from "node:test";
import assert from "node:assert/strict";
import { chooseAlertButton } from "../src/engine/alertIntent";

test("普通权限弹窗 → 点 Don't Allow", () => {
  const c = chooseAlertButton(
    '"TikTok" Would Like to Send You Notifications',
    ["Don't Allow", "Allow"],
  );
  assert.ok("label" in c && c.label === "Don't Allow");
});

test("跟踪弹窗 → 点 Ask App Not to Track", () => {
  const c = chooseAlertButton("Allow TikTok to track your activity", [
    "Ask App Not to Track",
    "Allow",
  ]);
  assert.ok("label" in c && /not to track/i.test(c.label));
});

test("相册弹窗 → 点允许（发视频需要）", () => {
  const c = chooseAlertButton('"TikTok" Would Like to Access Your Photos', [
    "Don't Allow",
    "Allow Access to All Photos",
  ]);
  assert.ok("label" in c && /allow/i.test(c.label));
});

test("登录弹窗仅 Cancel/Sign In → 点 Cancel", () => {
  const c = chooseAlertButton("Login required", ["Cancel", "Sign In"]);
  assert.ok("label" in c && c.label === "Cancel");
});

test("无匹配按钮 → dismiss 兜底", () => {
  const c = chooseAlertButton("Some random dialog", ["Foo", "Bar"]);
  assert.ok("dismiss" in c);
});
