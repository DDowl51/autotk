import { describe, it, expect } from "vitest";
import { humanizeError } from "./errors";

describe("humanizeError", () => {
  it("网络类 → 场景化补救", () => {
    expect(humanizeError(new Error("Network Error"), "publish")).toMatch(/网络异常/);
    expect(humanizeError(new Error("getaddrinfo ENOTFOUND"), "qr")).toMatch(/局域网/);
  });
  it("权限 / 找不到 → 场景化", () => {
    expect(humanizeError(new Error("EACCES: permission denied"), "scan")).toMatch(/权限/);
    expect(humanizeError(new Error("ENOENT: no such file"), "scan")).toMatch(/找不到/);
  });
  it("未知 / 空 → 兜底不崩", () => {
    expect(humanizeError(null)).toBe("未知错误");
    expect(humanizeError(new Error(""), "generic")).toBe("未知错误");
  });
  it("超长原始串截断", () => {
    const long = "x".repeat(200);
    expect(humanizeError(new Error(long), "generic").length).toBeLessThanOrEqual(81);
  });
});
