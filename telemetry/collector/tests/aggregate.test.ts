import test from "node:test";
import assert from "node:assert/strict";
import { summarize, bucketize } from "../src/aggregate";
import type { StoredEvent } from "../src/events";

const ev = (system: string, name: string, receivedAt: number): StoredEvent => ({
  system,
  anonId: "a",
  sessionId: "s",
  appVersion: null,
  name,
  props: {},
  ts: receivedAt,
  receivedAt,
});

const rows: StoredEvent[] = [
  ev("autotk", "app_open", 1000),
  ev("autotk", "engine_start", 1500),
  ev("autotk", "app_open", 2000),
  ev("management-center", "page_view", 2500),
];

test("summarize：总量 + 按系统 + 按事件(降序)", () => {
  const s = summarize(rows);
  assert.equal(s.total, 4);
  assert.deepEqual(s.bySystem, { autotk: 3, "management-center": 1 });
  assert.equal(s.byEvent[0].name, "app_open"); // 2 次，最多
  assert.equal(s.byEvent[0].count, 2);
});

test("summarize：since 过滤", () => {
  const s = summarize(rows, 2000);
  assert.equal(s.total, 2); // 只剩 2000、2500
});

test("bucketize：按桶计数、升序", () => {
  const pts = bucketize(rows, 1000, 0);
  // 桶 1000:{1000,1500}=2  桶 2000:{2000,2500}=2
  assert.deepEqual(pts, [
    { t: 1000, count: 2 },
    { t: 2000, count: 2 },
  ]);
});
