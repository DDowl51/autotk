import { describe, it, expect } from "vitest";
import { addRename, renamesFor, type RenameOp } from "./renameHistory";

const op = (deviceId: string, to: string, ts: number): RenameOp => ({ deviceId, from: "iPhone", to, ts });

describe("renameHistory", () => {
  it("addRename 最新在前、按 cap 截断", () => {
    let l: RenameOp[] = [];
    l = addRename(l, op("d1", "A", 1), 2);
    l = addRename(l, op("d1", "B", 2), 2);
    l = addRename(l, op("d1", "C", 3), 2);
    expect(l.map((o) => o.to)).toEqual(["C", "B"]);
  });

  it("renamesFor 按设备过滤", () => {
    const l = [op("d1", "A", 1), op("d2", "B", 2), op("d1", "C", 3)];
    expect(renamesFor(l, "d1").map((o) => o.to)).toEqual(["A", "C"]);
  });
});
