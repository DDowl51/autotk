import test from "node:test";
import assert from "node:assert/strict";
import { detectAppPopup, hasDismissControl, findPermissionDenyBox } from "../src/engine/popupDetect";
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

// —— 真机实测遇到的三个浮层（截图核实）——
test("浮层：接收好友新作品通知（强标题，✕/backdrop 脱困，不点接收）", () => {
  const hit = detectAppPopup([box("接收好友新作品通知？", 0.3, 0.7)]);
  assert.equal(hit?.id, "notif-friend");
  assert.deepEqual(hit?.dismiss, ["closeIcon", "tapOutside", "back"]);
});

test("浮层：虚拟头像（强标题）", () => {
  assert.equal(detectAppPopup([box("你的虚拟头像，你的专属风格", 0.3, 0.7)])?.id, "avatar");
});

test("浮层：发评论后通知提示（✕ 脱困，不点接收通知）", () => {
  assert.equal(detectAppPopup([box("在其他用户与你的评论互动时收到通知", 0.3, 0.6)])?.id, "notif-comment");
});

test("浮层：安全检查（个人主页，✕ 脱困，不点继续）", () => {
  const hit = detectAppPopup([box("让我们快速做个安全检查", 0.3, 0.6)]);
  assert.equal(hit?.id, "security-check");
  assert.deepEqual(hit?.dismiss, ["closeIcon", "tapOutside", "back"]);
});

test("浮层：通行密钥/iCloud 钥匙串（登录 passkey，✕ 脱困，不点设置）", () => {
  assert.equal(detectAppPopup([box("若要存储通行密钥，你需要启用 iCloud 钥匙串", 0.3, 0.6)])?.id, "passkey");
});

test("浮层：虚拟物品和奖励政策（可点「知道了」安全关掉）", () => {
  const boxes = [box("虚拟物品和奖励政策更新", 0.3, 0.4), box("知道了", 0.5, 0.7)];
  assert.equal(detectAppPopup(boxes)?.id, "policy");
  assert.equal(hasDismissControl([box("知道了")]), true); // 知道了 现在算关闭控件
  // planDismiss 的 closeText 应定位到「知道了」框中心
  const hit = detectAppPopup(boxes)!;
  const steps = planDismiss(hit, boxes, size);
  assert.equal(steps[0].kind, "tap");
});

test("浮层：英文界面也命中（avatar / policy / Got it）", () => {
  assert.equal(detectAppPopup([box("Create your TikTok avatar", 0.3, 0.7)])?.id, "avatar");
  assert.equal(detectAppPopup([box("Virtual Items and Rewards Policy", 0.3, 0.4)])?.id, "policy");
  assert.equal(hasDismissControl([box("Got it")]), true);
});

test("浮层：允许访问位置（版式一，先文字「暂时不要」后视觉 ✕，不点「打开设置」）", () => {
  const hit = detectAppPopup([box("允许访问位置，解锁本地瑰宝", 0.3, 0.68)]);
  assert.equal(hit?.id, "location");
  assert.deepEqual(hit?.dismiss, ["closeText", "tapOutside", "back"]);
  // 英文界面同样命中
  assert.equal(detectAppPopup([box("Allow location access", 0.3, 0.68)])?.id, "location");
});

test("浮层：查看附近的相关内容和场所（location 版式二，中英文 + 正文都命中，点「取消」不点「打开设置」）", () => {
  // 标题（中/英）
  assert.equal(detectAppPopup([box("查看附近的相关内容和场所", 0.3, 0.34)])?.id, "location");
  assert.equal(detectAppPopup([box("See relevant content and places nearby", 0.3, 0.34)])?.id, "location");
  // 两版共有正文措辞
  assert.equal(detectAppPopup([box("打开设备设置并前往 位置 使用应用期间", 0.3, 0.4)])?.id, "location");
  assert.equal(detectAppPopup([box("go to Location while using the app", 0.3, 0.4)])?.id, "location");
  // closeText 定位到「取消」而非「打开设置」
  assert.equal(hasDismissControl([box("取消")]), true);
  assert.equal(hasDismissControl([box("打开设置")]), false);
  const boxes = [
    box("查看附近的相关内容和场所", 0.3, 0.34),
    box("取消", 0.29, 0.68, 0.1, 0.03),
    box("打开设置", 0.6, 0.68, 0.15, 0.03),
  ];
  const steps = planDismiss(detectAppPopup(boxes)!, boxes, size);
  assert.equal(steps[0].kind, "tap");
  if (steps[0].kind === "tap") assert.equal(steps[0].point.x, (0.29 + 0.05) * 1000); // 「取消」中心
});

// —— IMG_0002 Shop 促销：✕ 在卡片下方居中（非右上）；靠签名 closeAt 点 (0.5, 0.785) ——
test("浮层：Shop 促销（choose up to N products / Pick now），closeAt 点卡片下方 ✕", () => {
  const en = detectAppPopup([box("You can choose up to this many products", 0.3, 0.5)]);
  assert.equal(en?.id, "shop-promo");
  assert.deepEqual(en?.closeAt, [0.5, 0.785]);
  assert.equal(detectAppPopup([box("Free shipping on all your picks", 0.3, 0.6)])?.id, "shop-promo");
  assert.equal(detectAppPopup([box("恭喜！你最多可挑选这么多商品", 0.3, 0.5)])?.id, "shop-promo");
  // planDismiss 首步就是点 closeAt 像素中心（0.5×1000, 0.785×2000）
  const steps = planDismiss(en!, [], size);
  assert.equal(steps[0].kind, "tap");
  if (steps[0].kind === "tap") {
    assert.equal(steps[0].point.x, 0.5 * 1000);
    assert.equal(steps[0].point.y, 0.785 * 2000);
  }
});

// —— IMG_0008 定位系统弹窗：WDA 读不到时靠 OCR 找「Don't Allow / 不允许」兜底点 ——
test("findPermissionDenyBox：命中 Don't Allow（直/弯引号/无引号）与「不允许」", () => {
  assert.ok(findPermissionDenyBox([box("Don't Allow", 0.5, 0.8)])); // U+0027 直引号
  assert.ok(findPermissionDenyBox([box("Don’t Allow", 0.5, 0.8)])); // U+2019 弯引号（iOS 实际）
  assert.ok(findPermissionDenyBox([box("Dont Allow", 0.5, 0.8)])); // OCR 漏撇号
  assert.ok(findPermissionDenyBox([box("不允许", 0.5, 0.8)]));
});
test("findPermissionDenyBox：不误伤正文/右栏（只整串按钮才算）", () => {
  assert.equal(findPermissionDenyBox([box("we won't allow spam here", 0.3, 0.5)]), null); // 正文含 allow
  assert.equal(findPermissionDenyBox([box("Allow Once", 0.5, 0.7)]), null); // 允许项不算拒绝
  assert.equal(findPermissionDenyBox([box("Don't Allow", 0.92, 0.5)]), null); // 落在右侧动作栏 → 忽略
  assert.equal(findPermissionDenyBox([box("hello", 0.3, 0.5)]), null);
});

// —— IMG_0007 误点广告的内嵌网页：✕ 在左上；绝不能上滑（会进外部页），dismiss 只有 closeAt ——
test("浮层：内嵌网页 sheet（Scroll up for fullscreen / Sign in to continue），只点左上 ✕、不上滑", () => {
  const hit = detectAppPopup([box("Scroll up for fullscreen view", 0.3, 0.62)]);
  assert.equal(hit?.id, "inapp-browser");
  assert.deepEqual(hit?.closeAt, [0.07, 0.755]);
  assert.equal(detectAppPopup([box("Sign in to continue", 0.3, 0.5)])?.id, "inapp-browser");
  assert.equal(detectAppPopup([box("上滑查看全屏", 0.3, 0.62)])?.id, "inapp-browser");
  // OCR 把「Scroll up for fullscreen view」拆行时，单独「fullscreen view」也要命中
  assert.equal(detectAppPopup([box("fullscreen view", 0.3, 0.62)])?.id, "inapp-browser");
  // dismiss 计划里除了 closeAt 的 tap，没有任何 swipe（防上滑进外部页）
  const steps = planDismiss(hit!, [], size);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].kind, "tap");
  if (steps[0].kind === "tap") {
    assert.equal(steps[0].point.x, 0.07 * 1000);
    assert.equal(steps[0].point.y, 0.755 * 2000);
  }
  assert.ok(!steps.some((s) => s.kind === "swipe"));
});

test("「暂时不要」是安全关闭词，closeText 定位到它而非红「打开设置」", () => {
  assert.equal(hasDismissControl([box("暂时不要")]), true);
  assert.equal(hasDismissControl([box("打开设置")]), false); // 危险按钮不算关闭控件
  const boxes = [
    box("允许访问位置，解锁本地瑰宝", 0.3, 0.68),
    box("暂时不要", 0.29, 0.92, 0.2, 0.04),
    box("打开设置", 0.71, 0.92, 0.2, 0.04),
  ];
  const hit = detectAppPopup(boxes)!;
  const p = findDismissText(boxes, size)!;
  // 命中「暂时不要」中心（x≈0.39×1000），不是「打开设置」
  assert.equal(p.x, (0.29 + 0.1) * 1000);
  // planDismiss 第一步就是点这个安全文字按钮
  const steps = planDismiss(hit, boxes, size);
  assert.equal(steps[0].kind, "tap");
  if (steps[0].kind === "tap") assert.equal(steps[0].point.x, (0.29 + 0.1) * 1000);
});
