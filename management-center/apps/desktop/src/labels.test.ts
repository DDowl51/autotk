import { describe, it, expect } from "vitest";
import { moduleLabel, pageLabel } from "@mc/shared";

describe("中文映射", () => {
  it("moduleLabel", () => {
    expect(moduleLabel("forYou")).toBe("推荐页");
    expect(moduleLabel("kwSearch")).toBe("关键词搜索");
    expect(moduleLabel("persHome")).toBe("个人主页");
    expect(moduleLabel("unknown")).toBe("unknown"); // 未知原样
    expect(moduleLabel(undefined)).toBe("—");
  });
  it("pageLabel", () => {
    expect(pageLabel("feed")).toBe("推荐流");
    expect(pageLabel("comments")).toBe("评论区");
    expect(pageLabel(undefined)).toBe("—");
  });
});
