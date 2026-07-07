import test from "node:test";
import assert from "node:assert/strict";
import { downloadToAlbum } from "../src/publish/downloader";
import type { PublishSource } from "../src/hub/protocol";

const src: PublishSource = { kind: "lan", url: "http://op/f/abc" };

test("下载+入相册成功 → 返回 assetUri，传入正确 url/文件名", async () => {
  let gotUrl = "";
  let gotName = "";
  const r = await downloadToAlbum(src, "v.mp4", {
    saveUrlToAlbum: async (url, name) => {
      gotUrl = url;
      gotName = name;
      return "asset://123";
    },
  });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.assetUri, "asset://123");
  assert.equal(gotUrl, "http://op/f/abc");
  assert.equal(gotName, "v.mp4");
});

test("下载失败（HTTP 非 2xx）→ 失败带原因", async () => {
  const r = await downloadToAlbum(src, "v.mp4", {
    saveUrlToAlbum: async () => {
      throw new Error("下载失败：HTTP 404");
    },
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /404/);
});

test("写相册失败（无权限）→ 失败带原因", async () => {
  const r = await downloadToAlbum(src, "v.mp4", {
    saveUrlToAlbum: async () => {
      throw new Error("没有相册写入权限");
    },
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /相册.*没有权限|没有相册写入权限/);
});

test("网络异常 → 失败带原因", async () => {
  const r = await downloadToAlbum(src, "v.mp4", {
    saveUrlToAlbum: async () => {
      throw new Error("网络断了");
    },
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /网络断了/);
});
