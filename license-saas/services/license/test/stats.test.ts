import test from "node:test";
import assert from "node:assert/strict";
import { bucketByDay, statusBreakdown } from "../src/core";

const DAY = 86_400_000;
const now = Date.UTC(2026, 5, 25, 12, 0, 0); // 2026-06-25 12:00 UTC

test("bucketByDay: 最近 N 天、补零、范围外忽略", () => {
  const today = now;
  const yesterday = now - DAY;
  const old = now - 10 * DAY; // 超出 7 天窗口
  const r = bucketByDay([today, today, yesterday, old], 7, now);
  assert.equal(r.length, 7);
  assert.equal(r[r.length - 1].date, "2026-06-25"); // 最后一天=今天
  assert.equal(r[r.length - 1].count, 2);
  assert.equal(r[r.length - 2].count, 1); // 昨天
  assert.equal(r[0].count, 0); // 7 天前那天没有
  // 窗口外的 old 不计入总和
  assert.equal(r.reduce((s, d) => s + d.count, 0), 3);
});

test("bucketByDay: 升序日期", () => {
  const r = bucketByDay([], 3, now);
  assert.deepEqual(
    r.map((d) => d.date),
    ["2026-06-23", "2026-06-24", "2026-06-25"],
  );
});

test("statusBreakdown: 固定顺序 + 补零", () => {
  const r = statusBreakdown(["ACTIVE", "ACTIVE", "UNUSED"]);
  assert.deepEqual(r, [
    { status: "UNUSED", count: 1 },
    { status: "ACTIVE", count: 2 },
    { status: "DISABLED", count: 0 },
  ]);
});
