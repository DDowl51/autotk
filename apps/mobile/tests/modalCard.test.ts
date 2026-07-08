import test from "node:test";
import assert from "node:assert/strict";
import { detectModalCard, detectCardClose } from "../src/vision/detect";
import type { DecodedImage } from "../src/vision/png";

// 构造 RGB 测试图（bpp=3，逻辑坐标=像素坐标，scale=1）。
function mkImg(W: number, H: number, fill: [number, number, number] = [255, 255, 255]): DecodedImage {
  const data = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    data[i * 3] = fill[0];
    data[i * 3 + 1] = fill[1];
    data[i * 3 + 2] = fill[2];
  }
  return { width: W, height: H, data, bpp: 3 };
}
function fillRect(
  img: DecodedImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  g: number,
  b: number,
): void {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 3;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
    }
  }
}

const W = 200;
const H = 400;

test("detectModalCard：顶部蒙层 + 白卡 + 右上纯黑 ✕ → 返回 ✕ 坐标", () => {
  const img = mkImg(W, H);
  fillRect(img, 0, 0, W, 140, 128, 128, 128); // 顶部变暗蒙层
  fillRect(img, 0, 140, W, H, 255, 255, 255); // 白卡卡体
  fillRect(img, 172, 150, 184, 162, 0, 0, 0); // 卡片右上纯黑 ✕（≈0.89W, 0.39H）
  const p = detectModalCard(img, W, H);
  assert.ok(p, "应检测到模态卡的 ✕");
  assert.ok(p!.x >= W * 0.8 && p!.x <= W * 0.96, `✕.x 应在卡顶右上带内，实际 ${p!.x}`);
  assert.ok(p!.y >= 140 && p!.y <= 140 + H * 0.09, `✕.y 应在卡顶带内，实际 ${p!.y}`);
});

test("detectModalCard：纯白页（无蒙层）→ null（不把正常白页当浮层）", () => {
  const img = mkImg(W, H); // 全白
  fillRect(img, 172, 150, 184, 162, 0, 0, 0); // 右上有个黑记号，但上方无蒙层
  assert.equal(detectModalCard(img, W, H), null);
});

test("detectCardClose：纯黑 ✕（位置卡样式）也能定位——旧的灰阈值会漏掉", () => {
  const img = mkImg(W, H);
  // 扫描窗 x∈[0.78,0.93]W、y∈[0.18,0.62]H 内放一簇纯黑（rgb 0,0,0）
  fillRect(img, 162, 150, 174, 162, 0, 0, 0);
  const p = detectCardClose(img, W, H);
  assert.ok(p, "纯黑 ✕ 应被 isAchromaticDark 命中");
  assert.ok(p!.x >= W * 0.78 && p!.x <= W * 0.93, `实际 ${p!.x}`);
});
