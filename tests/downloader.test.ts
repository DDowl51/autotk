import test from "node:test";
import assert from "node:assert/strict";
import { downloadToAlbum } from "../src/publish/downloader";
import type { PublishSource } from "../src/hub/protocol";

const src: PublishSource = { kind: "lan", url: "http://op/f/abc" };

function okFetch(bytes: number[]) {
  return async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  });
}

test("下载成功 → 写相册 → 返回 assetUri", async () => {
  let savedName = "";
  const r = await downloadToAlbum(src, "v.mp4", {
    fetch: okFetch([1, 2, 3, 4]),
    saveToAlbum: async (bytes, name) => {
      savedName = name;
      assert.equal(bytes.length, 4);
      return "asset://123";
    },
  });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.assetUri, "asset://123");
  assert.equal(savedName, "v.mp4");
});

test("HTTP 非 2xx → 失败带状态码", async () => {
  const r = await downloadToAlbum(src, "v.mp4", {
    fetch: async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }),
    saveToAlbum: async () => "x",
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /404/);
});

test("fetch 抛错 → 失败", async () => {
  const r = await downloadToAlbum(src, "v.mp4", {
    fetch: async () => {
      throw new Error("网络断了");
    },
    saveToAlbum: async () => "x",
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /网络断了/);
});

test("下载到空内容 → 失败", async () => {
  const r = await downloadToAlbum(src, "v.mp4", {
    fetch: okFetch([]),
    saveToAlbum: async () => "x",
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /空/);
});

test("写相册失败 → 失败带原因", async () => {
  const r = await downloadToAlbum(src, "v.mp4", {
    fetch: okFetch([1, 2, 3]),
    saveToAlbum: async () => {
      throw new Error("没有权限");
    },
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /相册.*没有权限/);
});
