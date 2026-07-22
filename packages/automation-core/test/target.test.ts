import { describe, expect, it } from "vitest";
import { toRegistry, type Target } from "../src/target";

const t = (id: string, extra: Partial<Target> = {}): Target => ({ id, phrase: id, kind: "expected", ...extra });

describe("toRegistry", () => {
  it("数组 → Map,按 id 查", () => {
    const r = toRegistry([t("a"), t("b")]);
    expect(r.size).toBe(2);
    expect(r.get("a")?.phrase).toBe("a");
    expect(r.get("missing")).toBeUndefined();
  });
  it("id 重复 → 抛错", () => {
    expect(() => toRegistry([t("a"), t("a")])).toThrow(/重复/);
  });
  it("空数组 → 空 Map", () => {
    expect(toRegistry([]).size).toBe(0);
  });
});
