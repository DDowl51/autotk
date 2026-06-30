import { describe, it, expect } from "vitest";
import { codeStatusView } from "./status";

describe("codeStatusView", () => {
  it("已过期优先于其它状态", () => {
    expect(codeStatusView("ACTIVE", "2020-01-01T00:00:00Z").label).toBe("已过期");
    expect(codeStatusView("UNUSED", "2020-01-01T00:00:00Z").label).toBe("已过期");
  });

  it("各状态文案/颜色", () => {
    expect(codeStatusView("ACTIVE", null)).toEqual({ color: "green", label: "已激活" });
    expect(codeStatusView("DISABLED", null)).toEqual({ color: "red", label: "已停用" });
    expect(codeStatusView("UNUSED", null)).toEqual({ color: "blue", label: "未激活" });
  });

  it("未来有效期不算过期", () => {
    expect(codeStatusView("ACTIVE", "2999-01-01T00:00:00Z").label).toBe("已激活");
  });

  it("可注入 now", () => {
    const exp = "2026-06-25T00:00:00Z";
    expect(codeStatusView("ACTIVE", exp, new Date("2026-06-26").getTime()).label).toBe("已过期");
    expect(codeStatusView("ACTIVE", exp, new Date("2026-06-24").getTime()).label).toBe("已激活");
  });
});
