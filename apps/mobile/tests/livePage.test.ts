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
