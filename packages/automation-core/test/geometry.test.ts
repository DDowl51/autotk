import { describe, expect, it } from "vitest";
import { centerPx, normPx, type Box } from "../src/geometry";

const size = { width: 750, height: 1334 };

describe("centerPx", () => {
  it("归一化框中心 → 像素", () => {
    const box: Box = [0.2, 0.4, 0.6, 0.8];
    const p = centerPx(box, size);
    expect(p.x).toBeCloseTo(0.4 * 750, 6); // (0.2+0.6)/2
    expect(p.y).toBeCloseTo(0.6 * 1334, 6); // (0.4+0.8)/2
  });
  it("零宽/零高框 → 该点", () => {
    const p = centerPx([0.5, 0.5, 0.5, 0.5], size);
    expect(p).toEqual({ x: 0.5 * 750, y: 0.5 * 1334 });
  });
});

describe("normPx", () => {
  it("归一化点 → 像素", () => {
    expect(normPx(0, 0, size)).toEqual({ x: 0, y: 0 });
    expect(normPx(1, 1, size)).toEqual({ x: 750, y: 1334 });
    expect(normPx(0.5, 0.66, size)).toEqual({ x: 375, y: 0.66 * 1334 });
  });
});
