import { describe, it, expect } from "vitest";
import { parseSettings } from "./settings";

describe("parseSettings", () => {
  const DEFAULTS = {
    hubUrl: "http://localhost:4000",
    videoRoot: "",
    stalledMinutes: 5,
    accent: "#c5f23f",
  };
  it("null → 默认值", () => {
    expect(parseSettings(null)).toEqual(DEFAULTS);
  });
  it("合法 JSON → 与默认合并", () => {
    expect(parseSettings('{"hubUrl":"http://h:5000"}')).toEqual({ ...DEFAULTS, hubUrl: "http://h:5000" });
  });
  it("坏 JSON → 默认值", () => {
    expect(parseSettings("not json").hubUrl).toBe("http://localhost:4000");
  });
});
