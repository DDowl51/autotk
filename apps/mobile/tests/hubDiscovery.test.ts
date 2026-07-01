import test from "node:test";
import assert from "node:assert/strict";
import { encodeBeacon, parseBeacon } from "../src/hub/beacon";
import { parseHubQr } from "../src/hub/hubUrl";

test("beacon 编解码往返", () => {
  assert.deepEqual(parseBeacon(encodeBeacon(4000)), { port: 4000 });
});

test("beacon：非本服务/坏数据/非法端口 → null", () => {
  assert.equal(parseBeacon('{"svc":"other","port":4000}'), null);
  assert.equal(parseBeacon("not json"), null);
  assert.equal(parseBeacon('{"svc":"autotk-hub","port":0}'), null);
  assert.equal(parseBeacon('{"svc":"autotk-hub"}'), null);
});

test("parseHubQr：取 scheme://host:port，丢路径", () => {
  assert.equal(parseHubQr("http://192.168.1.5:4000"), "http://192.168.1.5:4000");
  assert.equal(parseHubQr("  http://192.168.1.5:4000/  "), "http://192.168.1.5:4000");
  assert.equal(parseHubQr("https://hub.example.com:4000/x/y"), "https://hub.example.com:4000");
});

test("parseHubQr：非 http(s)/空/乱码 → null", () => {
  assert.equal(parseHubQr(""), null);
  assert.equal(parseHubQr("192.168.1.5:4000"), null);
  assert.equal(parseHubQr("ftp://x"), null);
  assert.equal(parseHubQr("随便一段文字"), null);
});
