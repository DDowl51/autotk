import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createHandler } from "../src/http";
import { MemoryEventStore } from "../src/adapters/memory-store";

function start(store: MemoryEventStore): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(createHandler(store));
    server.listen(0, () => {
      const a = server.address();
      const port = typeof a === "object" && a ? a.port : 0;
      resolve({ server, url: `http://localhost:${port}` });
    });
  });
}

test("POST /v1/events 收事件入库；GET /v1/stats 返回总数；health 正常", async () => {
  const store = new MemoryEventStore();
  const { server, url } = await start(store);
  try {
    const res = await fetch(`${url}/v1/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system: "autotk", anonId: "a1", events: [{ name: "app_open" }, { name: "like" }] }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { accepted: 2, rejected: 0 });
    assert.equal(await store.count(), 2);

    const stats = await fetch(`${url}/v1/stats`);
    assert.deepEqual(await stats.json(), { total: 2 });

    const summary = (await (await fetch(`${url}/v1/stats/summary`)).json()) as {
      total: number;
      bySystem: Record<string, number>;
      byEvent: Array<{ name: string; count: number }>;
    };
    assert.equal(summary.total, 2);
    assert.equal(summary.bySystem.autotk, 2);
    assert.equal(summary.byEvent.length, 2);

    const series = (await (await fetch(`${url}/v1/stats/series?bucket=60000`)).json()) as {
      bucketMs: number;
      points: unknown[];
    };
    assert.equal(series.bucketMs, 60000);
    assert.ok(Array.isArray(series.points));

    const health = await fetch(`${url}/health`);
    assert.equal(health.status, 200);
  } finally {
    server.close();
  }
});

test("坏 JSON → 400；未知路由 → 404", async () => {
  const { server, url } = await start(new MemoryEventStore());
  try {
    const bad = await fetch(`${url}/v1/events`, { method: "POST", body: "not json" });
    assert.equal(bad.status, 400);
    const nf = await fetch(`${url}/nope`);
    assert.equal(nf.status, 404);
  } finally {
    server.close();
  }
});
