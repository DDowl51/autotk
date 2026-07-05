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

// —— 真机发布流程遇到的中文系统弹窗（截图核实）——
test("麦克风权限(中文) → 点「好」而非「不允许」", () => {
  const c = chooseAlertButton('"TikTok"想访问你的麦克风', ["不允许", "好"]);
  assert.ok("label" in c && c.label === "好");
});

test("相机权限(中文) → 点「好」", () => {
  const c = chooseAlertButton('"TikTok"想访问你的相机', ["不允许", "好"]);
  assert.ok("label" in c && c.label === "好");
});

test("相册权限(中文) → 点「允许访问所有照片」，绝不误点含「允许」子串的「不允许」", () => {
  const c = chooseAlertButton('"TikTok"想访问你的照片', ["选择照片...", "允许访问所有照片", "不允许"]);
  assert.ok("label" in c && c.label === "允许访问所有照片");
});

test("Facebook 登录(中文) → 点「取消」拒绝", () => {
  const c = chooseAlertButton('"TikTok"想要使用"facebook.com"登录', ["取消", "继续"]);
  assert.ok("label" in c && c.label === "取消");
});

test("无匹配按钮 → dismiss 兜底", () => {
  const c = chooseAlertButton("Some random dialog", ["Foo", "Bar"]);
  assert.ok("dismiss" in c);
});
