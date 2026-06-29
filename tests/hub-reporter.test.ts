import test from "node:test";
import assert from "node:assert/strict";
import { buildStatus, LogBuffer } from "../src/hub/reporter";

test("buildStatus：映射 + alert 默认 null + ts", () => {
  const s = buildStatus(
    { running: true, module: "forYou", page: "feed", stats: { likes: 1, follows: 0, comments: 0, videos: 2 } },
    123,
  );
  assert.equal(s.running, true);
  assert.equal(s.module, "forYou");
  assert.equal(s.page, "feed");
  assert.equal(s.alert, null);
  assert.equal(s.ts, 123);
  assert.equal(s.stats?.videos, 2);
});

test("LogBuffer：合并相邻重复为 ×N", () => {
  const b = new LogBuffer();
  b.push({ level: "info", msg: "点赞", ts: 1 });
  b.push({ level: "info", msg: "点赞", ts: 2 });
  b.push({ level: "info", msg: "点赞", ts: 3 });
  b.push({ level: "info", msg: "划走", ts: 4 });
  const out = b.flush();
  assert.deepEqual(
    out.map((l) => l.msg),
    ["点赞 ×3", "划走"],
  );
});

test("LogBuffer：不同级别不合并", () => {
  const b = new LogBuffer();
  b.push({ level: "info", msg: "x", ts: 1 });
  b.push({ level: "warn", msg: "x", ts: 2 });
  assert.equal(b.flush().length, 2);
});

test("LogBuffer：超上限丢最旧 + 省略标记", () => {
  const b = new LogBuffer(3);
  for (let i = 0; i < 5; i++) b.push({ level: "info", msg: "m" + i, ts: i });
  const out = b.flush(999);
  assert.equal(out[0].msg, "…省略 2 条");
  assert.equal(out[0].ts, 999);
  assert.deepEqual(out.slice(1).map((l) => l.msg), ["m2", "m3", "m4"]);
});

test("LogBuffer：flush 后清空", () => {
  const b = new LogBuffer();
  b.push({ level: "info", msg: "a", ts: 1 });
  b.flush();
  assert.equal(b.size, 0);
  assert.equal(b.flush().length, 0);
});
