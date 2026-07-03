import test from "node:test";
import assert from "node:assert/strict";
import { isLivePage } from "../src/engine/livePage";
import type { OcrBox } from "../src/vision/caption";

const box = (text: string, y: number): OcrBox => ({ text, x: 0.1, y, w: 0.3, h: 0.03 });

test("isLivePage：下半屏出现「点击进入直播间/直播中」→ true", () => {
  assert.equal(isLivePage([box("点击进入直播间", 0.53)]), true);
  assert.equal(isLivePage([box("直播中", 0.6)]), true);
});

test("isLivePage：只在下半屏算——顶部/上半屏的同字不算（避开顶部 LIVE tab）", () => {
  assert.equal(isLivePage([box("直播中", 0.1)]), false); // 上半屏被过滤
});

test("isLivePage：普通视频文案 → false", () => {
  assert.equal(isLivePage([box("这是一条普通视频 #dance", 0.8)]), false);
});

test("isLivePage：英文——tap to watch LIVE 短语 → true", () => {
  assert.equal(isLivePage([box("Tap to watch LIVE", 0.53)]), true);
});

test("isLivePage：英文——左下角 LIVE 徽标算；文案里的 LIVE 不算", () => {
  assert.equal(isLivePage([{ text: "LIVE", x: 0.05, y: 0.72, w: 0.1, h: 0.03 }]), true);
  assert.equal(isLivePage([box("I LOVE LIVE MUSIC", 0.8)]), false); // 非整串 LIVE
  assert.equal(isLivePage([{ text: "LIVE", x: 0.05, y: 0.05, w: 0.1, h: 0.03 }]), false); // 顶部 tab 不算
});
