import test from "node:test";
import assert from "node:assert/strict";
import { detectCommentCloseButton } from "../src/vision/detect";
import type { DecodedImage } from "../src/vision/png";

// 构造 RGB 测试图（bpp=3，逻辑=像素，scale=1）。detectCommentCloseButton 的采样带 oy=90 偏移，
// 故「白面板顶」的物理 y = 90 + 内部 top。下面各图把面板顶放在物理 y=200。
function mkImg(W: number, H: number, fill: [number, number, number]): DecodedImage {
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

test("评论关闭×：顶端有地点横幅时，取横幅下方 tab 栏的真×（不被横幅右上深色小簇拉偏）", () => {
  const img = mkImg(W, H, [20, 20, 20]); // 上半是视频/蒙层（暗）
  fillRect(img, 0, 200, W, H, 255, 255, 255); // 白评论面板从 y=200 起
  fillRect(img, 175, 215, 186, 224, 30, 30, 30); // 地点横幅右上的深色小簇（旧版会被它拉偏）
  fillRect(img, 178, 268, 189, 281, 10, 10, 10); // tab 栏真×（在横幅下方）
  const p = detectCommentCloseButton(img, W, H);
  assert.ok(p, "应检测到关闭×");
  assert.ok(p!.y > 250, `应取下方 tab 栏真×(y≈274)而非横幅小簇(y≈219)，实际 y=${p!.y}`);
  assert.ok(p!.x >= 150 && p!.x <= 200, `×.x 应在右列，实际 ${p!.x}`);
  // 旧版 band=top+60（物理 y≤260）够不到真×(268)，会返回横幅小簇或 null——这条正是回归护栏。
});

test("评论关闭×：无地点横幅时，取紧贴面板顶的×（不回归）", () => {
  const img = mkImg(W, H, [20, 20, 20]);
  fillRect(img, 0, 200, W, H, 255, 255, 255);
  fillRect(img, 178, 205, 189, 218, 10, 10, 10); // ×紧贴面板顶
  const p = detectCommentCloseButton(img, W, H);
  assert.ok(p, "应检测到关闭×");
  assert.ok(p!.y >= 200 && p!.y <= 235, `×应在面板顶附近，实际 y=${p!.y}`);
});

test("评论关闭×：地点页/无白面板 → null（供关后校验判定「已离开面板」）", () => {
  const img = mkImg(W, H, [20, 20, 20]); // 全暗、无白面板
  assert.equal(detectCommentCloseButton(img, W, H), null);
});
