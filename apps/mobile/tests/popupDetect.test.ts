import test from "node:test";
import assert from "node:assert/strict";
import { detectAppPopup, hasDismissControl } from "../src/engine/popupDetect";
import { planDismiss, findDismissText } from "../src/engine/popupDismiss";
import type { OcrBox } from "../src/vision/caption";

const box = (text: string, x = 0.4, y = 0.4, w = 0.2, h = 0.04): OcrBox => ({ text, x, y, w, h });
const size = { width: 1000, height: 2000 };

test("强标题词单命中即判定（login）", () => {
  const hit = detectAppPopup([box("Log in to TikTok"), box("just normal", 0.4, 0.5)]);
  assert.equal(hit?.id, "login");
});

test("普通词需配合关闭控件才判定（notif）", () => {
  // 只有标记词、没关闭控件 → 不判定
  assert.equal(detectAppPopup([box("Turn on notifications")]), null);
  // 加一个 "Not now" 关闭控件 → 判定
  const hit = detectAppPopup([box("Turn on notifications"), box("Not now", 0.5, 0.6)]);
  assert.equal(hit?.id, "notif");
});

test("右侧动作栏里的文字不算标记（防误判）", () => {
  // "Add Yours" 落在右栏(cx>0.85) → 忽略
  assert.equal(detectAppPopup([box("Add Yours", 0.9, 0.5)]), null);
  // 同样文字在中央 → 命中
  assert.equal(detectAppPopup([box("Add Yours", 0.4, 0.5)])?.id, "addyours");
});

test("正常信息流不误判", () => {
  const feed = [box("好看的视频 #bikini", 0.1, 0.8), box("123.4K", 0.9, 0.5), box("Follow", 0.9, 0.4)];
  assert.equal(detectAppPopup(feed), null);
});

test("hasDismissControl 整串精确匹配", () => {
  assert.equal(hasDismissControl([box("Cancel")]), true);
  assert.equal(hasDismissControl([box("Cancel my order")]), false); // 不是整串
  assert.equal(hasDismissControl([box("✕", 0.92, 0.1)]), false); // 在右栏被忽略
});

test("planDismiss：closeText 找到按钮像素中心；按计划顺序", () => {
  const boxes = [box("Log in to TikTok", 0.3, 0.4), box("Not now", 0.5, 0.6, 0.2, 0.04)];
  const hit = detectAppPopup(boxes)!;
  const steps = planDismiss(hit, boxes, size);
  // login 计划 closeText→closeIcon→back
  assert.equal(steps[0].kind, "tap");
  if (steps[0].kind === "tap") {
    assert.equal(steps[0].point.x, (0.5 + 0.1) * 1000); // 0.6*1000
    assert.equal(steps[0].point.y, (0.6 + 0.02) * 2000);
  }
  assert.equal(steps[steps.length - 1].kind, "back");
});

test("planDismiss：没有关闭文字框则跳过 closeText 步", () => {
  const hit = { id: "login", dismiss: ["closeText", "closeIcon"] as const, matched: "x" };
  const steps = planDismiss({ ...hit, dismiss: [...hit.dismiss] }, [], size);
  // 无 closeText 框 → 只剩 closeIcon
  assert.equal(steps.length, 1);
  assert.equal(steps[0].kind, "tap");
});

test("findDismissText：无匹配返回 null", () => {
  assert.equal(findDismissText([box("hello")], size), null);
});
