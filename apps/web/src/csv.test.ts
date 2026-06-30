import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

const cols = [
  { key: "a", label: "A" },
  { key: "b", label: "B" },
];
const run = (rows: Record<string, unknown>[]) => toCsv(rows, cols);

describe("toCsv", () => {
  it("表头 + 行", () => {
    expect(run([{ a: 1, b: "x" }])).toBe("A,B\n1,x");
  });

  it("转义逗号 / 引号 / 换行", () => {
    expect(run([{ a: "x,y", b: 'he"llo' }, { a: "li\nne", b: "z" }])).toBe('A,B\n"x,y","he""llo"\n"li\nne",z');
  });

  it("null / undefined → 空", () => {
    expect(run([{ a: null, b: undefined }])).toBe("A,B\n,");
  });

  it("空数组 → 仅表头", () => {
    expect(run([])).toBe("A,B");
  });
});
