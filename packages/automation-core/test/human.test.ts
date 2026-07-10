import { describe, expect, it } from "vitest";
import { chance, jitter, pick, randInt } from "../src/human";

// 序列化 rng:按给定数组依次返回,便于确定性断言。
function seq(vals: number[]) {
  let i = 0;
  return () => vals[i++ % vals.length];
}

describe("chance", () => {
  it("边界:p<=0 恒 false,p>=1 恒 true", () => {
    expect(chance(0)).toBe(false);
    expect(chance(-1)).toBe(false);
    expect(chance(1)).toBe(true);
    expect(chance(2)).toBe(true);
  });
  it("rng()<p 命中", () => {
    expect(chance(0.5, seq([0.4]))).toBe(true);
    expect(chance(0.5, seq([0.5]))).toBe(false); // 严格 <
    expect(chance(0.5, seq([0.6]))).toBe(false);
  });
});

describe("jitter", () => {
  it("默认 ±30%:rng=0 → 下界 0.7n;rng≈1 → 接近上界 1.3n", () => {
    expect(jitter(1, 0.3, seq([0]))).toBeCloseTo(0.7);
    expect(jitter(1, 0.3, seq([0.5]))).toBeCloseTo(1.0);
    expect(jitter(1, 0.3, seq([0.999]))).toBeGreaterThan(1.29);
    expect(jitter(1, 0.3, seq([0.999]))).toBeLessThan(1.3);
  });
});

describe("randInt / pick", () => {
  it("randInt 闭区间", () => {
    expect(randInt(5, 15, seq([0]))).toBe(5);
    expect(randInt(5, 15, seq([0.999999]))).toBe(15);
  });
  it("pick 空数组 → undefined", () => {
    expect(pick([], seq([0]))).toBeUndefined();
    expect(pick(["a", "b", "c"], seq([0.5]))).toBe("b");
  });
});
