import test from "node:test";
import assert from "node:assert/strict";
import { normalize } from "../src/events";
import { ingest } from "../src/ingest";
import { MemoryEventStore } from "../src/adapters/memory-store";

test("normalize：保留合法事件、丢没名字的、缺省兜底", () => {
  const { rows, rejected } = normalize(
    {
      system: "autotk",
      anonId: "a1",
      sessionId: "s1",
      events: [
        { name: "app_open", props: { v: 1 }, ts: 5 },
        { name: "", props: {} } as any, // 没名字 → 丢
        { props: { x: 1 } } as any, // 没名字 → 丢
        { name: "like" }, // 无 ts → 用 receivedAt
      ],
    },
    999,
  );
  assert.equal(rows.length, 2);
  assert.equal(rejected, 2);
  assert.equal(rows[0].name, "app_open");
  assert.equal(rows[0].ts, 5);
  assert.equal(rows[1].name, "like");
  assert.equal(rows[1].ts, 999); // 兜底 receivedAt
  assert.deepEqual(rows[1].props, {});
});

test("normalize：system 缺省 unknown，events 非数组当空", () => {
  const { rows } = normalize({ events: undefined }, 1);
  assert.equal(rows.length, 0);
  const r2 = normalize({ system: "x", events: [{ name: "e" }] }, 1);
  assert.equal(r2.rows[0].system, "x");
});

test("ingest：入库内存 store，返回 accepted/rejected", async () => {
  const store = new MemoryEventStore();
  const r = await ingest(
    { system: "license-server", events: [{ name: "activate" }, { name: "" } as any] },
    store,
    100,
  );
  assert.deepEqual(r, { accepted: 1, rejected: 1 });
  assert.equal(await store.count(), 1);
  assert.equal(store.rows[0].name, "activate");
  assert.equal(store.rows[0].receivedAt, 100);
});

test("ingest：空事件不写库", async () => {
  const store = new MemoryEventStore();
  const r = await ingest({ system: "x", events: [] }, store, 1);
  assert.deepEqual(r, { accepted: 0, rejected: 0 });
  assert.equal(await store.count(), 0);
});
