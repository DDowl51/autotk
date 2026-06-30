import test from "node:test";
import assert from "node:assert/strict";
import { PublishQueue, runPublish } from "../src/publish/publishQueue";
import type { PublishTaskMsg, PublishStatus } from "../src/hub/protocol";

const task = (taskId: string, videoName = "v.mp4"): PublishTaskMsg => ({
  taskId,
  videoName,
  caption: "hi",
  source: { kind: "lan", url: "http://x/f/t" },
});

test("PublishQueue：enqueue 去重", () => {
  const q = new PublishQueue();
  assert.equal(q.enqueue(task("t1")), true);
  assert.equal(q.enqueue(task("t1")), false); // 重复
  assert.equal(q.list().length, 1);
});

test("PublishQueue：nextPending 取 sent、FIFO，非 sent 不再取", () => {
  const q = new PublishQueue();
  q.enqueue(task("t1"));
  q.enqueue(task("t2"));
  assert.equal(q.nextPending()?.task.taskId, "t1");
  q.setStatus("t1", "downloading");
  assert.equal(q.nextPending()?.task.taskId, "t2"); // t1 已开始，跳过
  q.setStatus("t2", "published");
  assert.equal(q.nextPending(), undefined);
});

test("runPublish：成功流程 downloading→downloaded→publishing→published", async () => {
  const seq: PublishStatus[] = [];
  const end = await runPublish(task("t1"), {
    download: async () => ({ ok: true, assetUri: "asset://1" }),
    publishVideo: async () => {},
    onStatus: (s) => seq.push(s),
  });
  assert.deepEqual(seq, ["downloading", "downloaded", "publishing", "published"]);
  assert.equal(end, "published");
});

test("runPublish：下载失败 → failed，不进入发布", async () => {
  const seq: PublishStatus[] = [];
  let published = false;
  const end = await runPublish(task("t1"), {
    download: async () => ({ ok: false, error: "HTTP 404" }),
    publishVideo: async () => {
      published = true;
    },
    onStatus: (s) => seq.push(s),
  });
  assert.deepEqual(seq, ["downloading", "failed"]);
  assert.equal(end, "failed");
  assert.equal(published, false);
});

test("runPublish：发布抛错 → failed 带原因", async () => {
  const seq: PublishStatus[] = [];
  let lastErr = "";
  const end = await runPublish(task("t1"), {
    download: async () => ({ ok: true, assetUri: "asset://1" }),
    publishVideo: async () => {
      throw new Error("上传超时");
    },
    onStatus: (s, e) => {
      seq.push(s);
      if (e) lastErr = e;
    },
  });
  assert.deepEqual(seq, ["downloading", "downloaded", "publishing", "failed"]);
  assert.equal(end, "failed");
  assert.match(lastErr, /上传超时/);
});
