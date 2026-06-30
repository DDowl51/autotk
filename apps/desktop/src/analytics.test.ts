import { describe, it, expect } from "vitest";
import { toChart, systemLabel } from "./analytics";

describe("analytics", () => {
  it("toChart：小时桶用 时:分 标签", () => {
    const d = new Date("2026-06-28T09:05:00").getTime();
    expect(toChart([{ t: d, count: 3 }], 3600_000)).toEqual([{ label: "09:05", count: 3 }]);
  });

  it("toChart：天桶用 月-日 标签", () => {
    const d = new Date("2026-06-28T00:00:00").getTime();
    expect(toChart([{ t: d, count: 7 }], 86_400_000)).toEqual([{ label: "06-28", count: 7 }]);
  });

  it("systemLabel 映射中文、未知原样", () => {
    expect(systemLabel("autotk")).toBe("手机端");
    expect(systemLabel("license-server")).toBe("授权服务");
    expect(systemLabel("xyz")).toBe("xyz");
  });
});
